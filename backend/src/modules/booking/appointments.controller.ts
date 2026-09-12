import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { eventBus } from '../../events/bus';
import { invalidateAvailabilityCache } from './availability.controller';
import { canTransition, normalizeStatus } from './appointmentStateMachine';

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMins = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

export async function listAppointments(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { branchId, branch_id, date, appointment_date, status } = req.query;

    const targetBranchId = (branchId || branch_id) as string | undefined;
    const targetDateStr = (date || appointment_date) as string | undefined;
    const targetStatus = status as string | undefined;

    const where: any = {};

    if (userRole === 'CUSTOMER') {
      where.user_id = userId;
    } else {
      if (targetBranchId) {
        where.branch_id = targetBranchId;
      }
    }

    if (targetDateStr) {
      const normalizedDateStr = targetDateStr.split('T')[0];
      where.appointment_date = new Date(`${normalizedDateStr}T00:00:00.000Z`);
    }

    if (targetStatus) {
      where.status = targetStatus;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, address: true } },
        service: { select: { id: true, name: true, duration_minutes: true, price: true } },
        user: { select: { id: true, name: true, email: true, phone: true } }
      },
      orderBy: [
        { appointment_date: 'asc' },
        { start_time: 'asc' }
      ]
    });

    res.status(200).json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Error listing appointments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list appointments'
      }
    });
  }
}

/**
 * Concurrency Model Note:
 * Writes confirming reservations and creating appointments execute inside a transaction
 * with SELECT ... FOR UPDATE row locks on the Reservation, followed by FOR UPDATE SKIP LOCKED
 * resource allocation queries. Reschedules acquire pg_advisory_xact_lock on the target slot.
 */
export async function confirmReservationForUser(
  reservationId: string,
  userId: string,
  options: { idempotencyKey?: string | null; notes?: string | null } = {}
): Promise<{ appointment: any; isExisting?: boolean }> {
  const idempotencyKey = options.idempotencyKey || null;
  const notes = options.notes || null;

  if (idempotencyKey) {
    const existing = await prisma.appointment.findFirst({
      where: { idempotency_key: idempotencyKey, user_id: userId },
      include: {
        branch: { select: { id: true, name: true, address: true } },
        service: { select: { id: true, name: true, duration_minutes: true, price: true } }
      }
    });
    if (existing) return { appointment: existing, isExisting: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    const reservations: any[] = await tx.$queryRaw`
      SELECT * FROM "reservations" WHERE "id" = ${reservationId}::uuid FOR UPDATE
    `;
    if (!reservations || reservations.length === 0) throw new Error('NOT_FOUND');
    const reservation = reservations[0];
    if (reservation.user_id !== userId) throw new Error('FORBIDDEN');
    if (new Date(reservation.expires_at).getTime() <= Date.now()) throw new Error('RESERVATION_EXPIRED');

    const service = await tx.service.findUnique({ where: { id: reservation.service_id } });
    if (!service) throw new Error('SERVICE_NOT_FOUND');

    const requiredResourceTypes = await tx.serviceResource.findMany({
      where: { service_id: reservation.service_id }
    });
    const uniqueTypes = [...new Set(requiredResourceTypes.map((rt) => rt.resource_type))];
    const assignedResourceIds: string[] = [];

    for (const type of uniqueTypes) {
      const available: any[] = await tx.$queryRaw`
        SELECT r.id FROM "resources" r
        WHERE r.branch_id = ${reservation.branch_id}::uuid
          AND r.type = ${type}
          AND r.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM "appointment_resources" ar
            JOIN "appointments" ap ON ap.id = ar.appointment_id
            WHERE ar.resource_id = r.id
              AND ap.appointment_date = ${reservation.slot_date}::date
              AND ap.start_time = ${reservation.slot_time}
              AND ap.status NOT IN ('CANCELLED', 'NO_SHOW')
          )
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!available || available.length === 0) {
        throw new Error('RESOURCE_UNAVAILABLE');
      }
      assignedResourceIds.push(available[0].id);
    }

    const endTime = calculateEndTime(reservation.slot_time, service.duration_minutes);
    const year = new Date(reservation.slot_date).getUTCFullYear();

    let appointment: any;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        const appointmentNumber = `APT-${year}-${randomNum}`;

        appointment = await tx.appointment.create({
          data: {
            appointment_number: appointmentNumber,
            user_id: userId,
            branch_id: reservation.branch_id,
            service_id: reservation.service_id,
            appointment_date: reservation.slot_date,
            start_time: reservation.slot_time,
            end_time: endTime,
            status: 'CONFIRMED',
            notes: notes,
            idempotency_key: idempotencyKey
          },
          include: {
            branch: { select: { id: true, name: true, address: true } },
            service: { select: { id: true, name: true, duration_minutes: true, price: true } }
          }
        });
        break;
      } catch (err: any) {
        if (err.code === 'P2002' && (err.meta?.target?.includes('appointment_number') || String(err.message).includes('appointment_number'))) {
          attempts++;
          if (attempts >= 3) throw err;
        } else {
          throw err;
        }
      }
    }

    for (const resourceId of assignedResourceIds) {
      await tx.appointmentResource.create({
        data: { appointment_id: appointment.id, resource_id: resourceId }
      });
    }

    await tx.reservation.delete({ where: { id: reservationId } });

    await tx.auditLog.create({
      data: { appointment_id: appointment.id, action: 'APPOINTMENT_CONFIRMED', old_status: null, new_status: 'CONFIRMED' }
    });

    return { appointment, reservation };
  });

  const dateStr = result.reservation.slot_date.toISOString().split('T')[0];
  await invalidateAvailabilityCache(result.reservation.branch_id, result.reservation.service_id, dateStr);

  eventBus.publish('appointment.confirmed', {
    appointmentId: result.appointment.id,
    appointmentNumber: result.appointment.appointment_number,
    userId: result.appointment.user_id,
    branchId: result.appointment.branch_id,
    serviceId: result.appointment.service_id
  });

  return { appointment: result.appointment };
}

export async function createAppointment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const reservationId = req.body.reservationId || req.body.reservation_id;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey || req.body.idempotency_key;
    const notes = req.body.notes || req.body.special_notes || req.body.specialNotes || null;

    if (!reservationId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reservationId is required' } });
      return;
    }

    try {
      const { appointment, isExisting } = await confirmReservationForUser(reservationId, userId, { idempotencyKey, notes });
      res.status(isExisting ? 200 : 201).json({ success: true, data: appointment });
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
        return;
      }
      if (err.message === 'FORBIDDEN') {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation belongs to another user' } });
        return;
      }
      if (err.message === 'RESERVATION_EXPIRED') {
        res.status(400).json({ success: false, error: { code: 'RESERVATION_EXPIRED', message: 'Reservation has expired' } });
        return;
      }
      if (err.message === 'RESOURCE_UNAVAILABLE') {
        res.status(409).json({
          success: false,
          error: { code: 'RESOURCE_UNAVAILABLE', message: 'A required resource is unavailable for this slot' }
        });
        return;
      }
      if (err.code === 'P2002' && idempotencyKey) {
        const existing = await prisma.appointment.findFirst({
          where: { idempotency_key: idempotencyKey, user_id: userId },
          include: {
            branch: { select: { id: true, name: true, address: true } },
            service: { select: { id: true, name: true, duration_minutes: true, price: true } }
          }
        });
        if (existing) {
          res.status(200).json({ success: true, data: existing });
          return;
        }
      }
      throw err;
    }
  } catch (error) {
    console.error('Error confirming appointment booking:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to confirm appointment' } });
  }
}

export async function getAppointmentById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        branch: true,
        service: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        audit_logs: { orderBy: { created_at: 'asc' } }
      }
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
      return;
    }

    if (userRole === 'CUSTOMER' && appointment.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch appointment'
      }
    });
  }
}

export async function updateAppointmentStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status is required'
        }
      });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
      return;
    }

    const nextStatus = normalizeStatus(status);
    if (!canTransition(appointment.status, nextStatus)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Invalid status transition from ${appointment.status} to ${nextStatus}`
        }
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: nextStatus }
      });

      await tx.auditLog.create({
        data: {
          appointment_id: id,
          action: nextStatus === 'NO_SHOW' ? 'APPOINTMENT_NO_SHOW' : 'STATUS_UPDATED',
          old_status: appointment.status,
          new_status: nextStatus
        }
      });

      return appt;
    });

    const dateStr = appointment.appointment_date.toISOString().split('T')[0];
    if (nextStatus === 'CANCELLED' || nextStatus === 'NO_SHOW') {
      await invalidateAvailabilityCache(appointment.branch_id, appointment.service_id, dateStr);
    }

    if (nextStatus === 'NO_SHOW') {
      eventBus.publish('appointment.no_show', {
        appointmentId: updated.id,
        branchId: updated.branch_id,
        serviceId: updated.service_id,
        userId: updated.user_id,
        appointmentDate: updated.appointment_date,
        startTime: updated.start_time
      });
    } else if (nextStatus === 'COMPLETED') {
      eventBus.publish('appointment.completed', {
        appointmentId: updated.id,
        userId: updated.user_id
      });
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update appointment status'
      }
    });
  }
}

export async function cancelAppointment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
      return;
    }

    if (userRole === 'CUSTOMER' && appointment.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    if (!canTransition(appointment.status, 'CANCELLED')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot cancel appointment with status ${appointment.status}`
        }
      });
      return;
    }

    const reason = req.body.reason || req.body.cancellation_reason || req.body.cancellationReason || null;

    const updated = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      await tx.auditLog.create({
        data: {
          appointment_id: id,
          action: 'APPOINTMENT_CANCELLED',
          reason: reason,
          old_status: appointment.status,
          new_status: 'CANCELLED'
        }
      });

      return appt;
    });

    const dateStr = appointment.appointment_date.toISOString().split('T')[0];
    await invalidateAvailabilityCache(appointment.branch_id, appointment.service_id, dateStr);

    eventBus.publish('appointment.cancelled', {
      appointmentId: updated.id,
      branchId: updated.branch_id,
      serviceId: updated.service_id,
      appointmentDate: updated.appointment_date,
      startTime: updated.start_time,
      userId: updated.user_id
    });

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel appointment'
      }
    });
  }
}

export async function rescheduleAppointment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { id } = req.params;
    const {
      new_slot_date,
      newSlotDate = new_slot_date,
      new_slot_time,
      newSlotTime = new_slot_time,
      new_branch_id,
      newBranchId = new_branch_id,
      new_service_id,
      newServiceId = new_service_id
    } = req.body;

    if (!newSlotDate || !newSlotTime) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'newSlotDate and newSlotTime are required'
        }
      });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
      return;
    }

    if (userRole === 'CUSTOMER' && appointment.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    if (appointment.status !== 'CONFIRMED') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot reschedule appointment with status ${appointment.status}`
        }
      });
      return;
    }

    const targetBranchId = newBranchId || appointment.branch_id;
    const targetServiceId = newServiceId || appointment.service_id;
    const normalizedNewDateStr = typeof newSlotDate === 'string' ? newSlotDate.split('T')[0] : new Date(newSlotDate).toISOString().split('T')[0];
    const targetNewDate = new Date(`${normalizedNewDateStr}T00:00:00.000Z`);
    const normalizedNewTime = newSlotTime.slice(0, 5);

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // 1. Fetch service to check duration and capacity
        const service = await tx.service.findUnique({
          where: { id: targetServiceId }
        });

        if (!service || !service.is_active) {
          throw new Error('SERVICE_NOT_FOUND');
        }

        // 2. Serialize concurrent reschedules/bookings onto this exact new slot
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${targetBranchId} || ${targetServiceId} || ${normalizedNewDateStr} || ${normalizedNewTime}))
        `;

        const existingCount = await tx.appointment.count({
          where: {
            branch_id: targetBranchId,
            service_id: targetServiceId,
            appointment_date: targetNewDate,
            start_time: normalizedNewTime,
            status: { not: 'CANCELLED' }
          }
        });

        const activeResCount = await tx.reservation.count({
          where: {
            branch_id: targetBranchId,
            service_id: targetServiceId,
            slot_date: targetNewDate,
            slot_time: normalizedNewTime,
            expires_at: { gt: new Date() }
          }
        });

        const capacity = service.capacity && service.capacity > 0 ? service.capacity : 1;
        if (existingCount + activeResCount >= capacity) {
          throw new Error('SLOT_UNAVAILABLE');
        }

        // 3. Check and lock required resources for the new slot
        const requiredResourceTypes = await tx.serviceResource.findMany({
          where: { service_id: targetServiceId }
        });
        const uniqueTypes = [...new Set(requiredResourceTypes.map((rt) => rt.resource_type))];
        const assignedResourceIds: string[] = [];

        for (const type of uniqueTypes) {
          const available: any[] = await tx.$queryRaw`
            SELECT r.id FROM "resources" r
            WHERE r.branch_id = ${targetBranchId}::uuid
              AND r.type = ${type}
              AND r.is_active = true
              AND NOT EXISTS (
                SELECT 1 FROM "appointment_resources" ar
                JOIN "appointments" ap ON ap.id = ar.appointment_id
                WHERE ar.resource_id = r.id
                  AND ap.id != ${id}::uuid
                  AND ap.appointment_date = ${targetNewDate}::date
                  AND ap.start_time = ${normalizedNewTime}
                  AND ap.status NOT IN ('CANCELLED', 'NO_SHOW')
              )
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;
          if (!available || available.length === 0) {
            throw new Error('RESOURCE_UNAVAILABLE');
          }
          assignedResourceIds.push(available[0].id);
        }

        const newEndTime = calculateEndTime(normalizedNewTime, service.duration_minutes);

        // 4. Update appointment to new slot
        const appt = await tx.appointment.update({
          where: { id },
          data: {
            branch_id: targetBranchId,
            service_id: targetServiceId,
            appointment_date: targetNewDate,
            start_time: normalizedNewTime,
            end_time: newEndTime
          }
        });

        // 5. Reassign appointment resources
        await tx.appointmentResource.deleteMany({
          where: { appointment_id: id }
        });

        for (const resourceId of assignedResourceIds) {
          await tx.appointmentResource.create({
            data: { appointment_id: id, resource_id: resourceId }
          });
        }

        // 6. Write audit log
        await tx.auditLog.create({
          data: {
            appointment_id: id,
            action: 'APPOINTMENT_RESCHEDULED',
            old_status: appointment.status,
            new_status: appointment.status
          }
        });

        return appt;
      });

      // Invalidate cache for both old and new slots
      const oldDateStr = appointment.appointment_date.toISOString().split('T')[0];
      await invalidateAvailabilityCache(appointment.branch_id, appointment.service_id, oldDateStr);
      await invalidateAvailabilityCache(targetBranchId, targetServiceId, normalizedNewDateStr);

      eventBus.publish('appointment.rescheduled', {
        appointmentId: updated.id,
        oldDate: oldDateStr,
        oldTime: appointment.start_time,
        newDate: normalizedNewDateStr,
        newTime: normalizedNewTime,
        userId: updated.user_id
      });

      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (err: any) {
      if (err.message === 'SLOT_UNAVAILABLE') {
        res.status(409).json({
          success: false,
          error: {
            code: 'SLOT_UNAVAILABLE',
            message: 'The requested new slot is already booked or reserved'
          }
        });
        return;
      }
      if (err.message === 'RESOURCE_UNAVAILABLE') {
        res.status(409).json({
          success: false,
          error: {
            code: 'RESOURCE_UNAVAILABLE',
            message: 'Required resources are not available for the requested slot'
          }
        });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reschedule appointment'
      }
    });
  }
}
