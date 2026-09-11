import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { eventBus } from '../../events/bus';
import { invalidateAvailabilityCache } from './availability.controller';

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
