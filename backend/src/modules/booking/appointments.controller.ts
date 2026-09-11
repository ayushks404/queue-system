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

export async function createAppointment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const reservationId = req.body.reservationId || req.body.reservation_id;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey || req.body.idempotency_key;

    if (!reservationId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'reservationId is required'
        }
      });
      return;
    }

    // Check Idempotency-Key
    if (idempotencyKey) {
      const existing = await prisma.appointment.findFirst({
        where: {
          idempotency_key: idempotencyKey,
          user_id: userId
        },
        include: {
          branch: { select: { id: true, name: true, address: true } },
          service: { select: { id: true, name: true, duration_minutes: true, price: true } }
        }
      });

      if (existing) {
        res.status(200).json({
          success: true,
          data: existing
        });
        return;
      }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. SELECT ... FOR UPDATE on reservation
        const reservations: any[] = await tx.$queryRaw`
          SELECT * FROM "reservations"
          WHERE "id" = ${reservationId}::uuid
          FOR UPDATE
        `;

        if (!reservations || reservations.length === 0) {
          throw new Error('NOT_FOUND');
        }

        const reservation = reservations[0];

        if (reservation.user_id !== userId) {
          throw new Error('FORBIDDEN');
        }

        if (new Date(reservation.expires_at).getTime() <= Date.now()) {
          throw new Error('RESERVATION_EXPIRED');
        }

        // 2. Fetch service for duration calculation
        const service = await tx.service.findUnique({
          where: { id: reservation.service_id }
        });

        if (!service) {
          throw new Error('SERVICE_NOT_FOUND');
        }

        const endTime = calculateEndTime(reservation.slot_time, service.duration_minutes);
        const year = new Date(reservation.slot_date).getUTCFullYear();
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        const appointmentNumber = `APT-${year}-${randomNum}`;

        // 3. Create appointment
        const appointment = await tx.appointment.create({
          data: {
            appointment_number: appointmentNumber,
            user_id: userId,
            branch_id: reservation.branch_id,
            service_id: reservation.service_id,
            appointment_date: reservation.slot_date,
            start_time: reservation.slot_time,
            end_time: endTime,
            status: 'CONFIRMED',
            idempotency_key: idempotencyKey || null
          },
          include: {
            branch: { select: { id: true, name: true, address: true } },
            service: { select: { id: true, name: true, duration_minutes: true, price: true } }
          }
        });

        // 4. Delete reservation
        await tx.reservation.delete({
          where: { id: reservationId }
        });

        // 5. Write audit log
        await tx.auditLog.create({
          data: {
            appointment_id: appointment.id,
            action: 'APPOINTMENT_CONFIRMED',
            old_status: null,
            new_status: 'CONFIRMED'
          }
        });

        return { appointment, reservation };
      });

      // Invalidate availability cache
      const dateStr = result.reservation.slot_date.toISOString().split('T')[0];
      await invalidateAvailabilityCache(result.reservation.branch_id, result.reservation.service_id, dateStr);

      // Publish event to event bus
      eventBus.publish('appointment.confirmed', {
        appointmentId: result.appointment.id,
        appointmentNumber: result.appointment.appointment_number,
        userId: result.appointment.user_id,
        branchId: result.appointment.branch_id,
        serviceId: result.appointment.service_id
      });

      res.status(201).json({
        success: true,
        data: result.appointment
      });
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Reservation not found'
          }
        });
        return;
      }

      if (err.message === 'FORBIDDEN') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Reservation belongs to another user'
          }
        });
        return;
      }

      if (err.message === 'RESERVATION_EXPIRED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'RESERVATION_EXPIRED',
            message: 'Reservation has expired'
          }
        });
        return;
      }

      throw err;
    }
  } catch (error) {
    console.error('Error confirming appointment booking:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to confirm appointment'
      }
    });
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

    const updated = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      await tx.auditLog.create({
        data: {
          appointment_id: id,
          action: 'APPOINTMENT_CANCELLED',
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

    const newSlotDate = req.body.newSlotDate || req.body.new_slot_date || req.body.slotDate || req.body.slot_date;
    const newSlotTime = req.body.newSlotTime || req.body.new_slot_time || req.body.slotTime || req.body.slot_time;
    const newBranchId = req.body.newBranchId || req.body.new_branch_id || req.body.branchId || req.body.branch_id;
    const newServiceId = req.body.newServiceId || req.body.new_service_id || req.body.serviceId || req.body.service_id;

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

    if (appointment.status !== 'CONFIRMED' && appointment.status !== 'PENDING') {
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

        // 2. Check if new slot already has active booking
        const existingCount = await tx.appointment.count({
          where: {
            branch_id: targetBranchId,
            service_id: targetServiceId,
            appointment_date: targetNewDate,
            start_time: normalizedNewTime,
            status: { not: 'CANCELLED' }
          }
        });

        const capacity = service.capacity && service.capacity > 0 ? service.capacity : 1;
        if (existingCount >= capacity) {
          throw new Error('SLOT_UNAVAILABLE');
        }

        // 3. Check active reservation on new slot
        const activeRes = await tx.reservation.findFirst({
          where: {
            branch_id: targetBranchId,
            service_id: targetServiceId,
            slot_date: targetNewDate,
            slot_time: normalizedNewTime,
            expires_at: { gt: new Date() }
          }
        });

        if (activeRes) {
          throw new Error('SLOT_UNAVAILABLE');
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

        // 5. Write audit log
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
