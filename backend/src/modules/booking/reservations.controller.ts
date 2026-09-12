import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { invalidateAvailabilityCache } from './availability.controller';
import { getReservationExpiryQueue } from '../../queues/reservationExpiry.queue';

export async function createReservation(req: Request, res: Response): Promise<void> {
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

    const branchId = req.body.branchId || req.body.branch_id;
    const serviceId = req.body.serviceId || req.body.service_id;
    const slotDate = req.body.slotDate || req.body.slot_date;
    const slotTime = req.body.slotTime || req.body.slot_time;

    if (!branchId || !serviceId || !slotDate || !slotTime) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId, serviceId, slotDate, and slotTime are required'
        }
      });
      return;
    }

    const normalizedDateStr = typeof slotDate === 'string' ? slotDate.split('T')[0] : new Date(slotDate).toISOString().split('T')[0];
    const targetDate = new Date(`${normalizedDateStr}T00:00:00.000Z`);
    const normalizedTime = slotTime.slice(0, 5);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    });

    if (!branch || !branch.is_active) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Branch not found or inactive'
        }
      });
      return;
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service || !service.is_active) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Service not found or inactive'
        }
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute hold

    // Execute reservation creation inside a transaction with lock/conflict check
    try {
      const reservation = await prisma.$transaction(async (tx) => {
        // 0. Serialize every concurrent attempt on this exact slot
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${branchId} || ${serviceId} || ${normalizedDateStr} || ${normalizedTime}))
        `;

        // 1. Delete any expired reservations for this slot so expired holds are reclaimed
        await tx.reservation.deleteMany({
          where: {
            branch_id: branchId,
            service_id: serviceId,
            slot_date: targetDate,
            slot_time: normalizedTime,
            expires_at: { lte: new Date() }
          }
        });

        // 2. Count active appointments AND active reservations together against capacity
        const activeAppointments = await tx.appointment.count({
          where: {
            branch_id: branchId,
            service_id: serviceId,
            appointment_date: targetDate,
            start_time: normalizedTime,
            status: { not: 'CANCELLED' }
          }
        });

        const activeReservations = await tx.reservation.count({
          where: {
            branch_id: branchId,
            service_id: serviceId,
            slot_date: targetDate,
            slot_time: normalizedTime,
            expires_at: { gt: new Date() }
          }
        });

        const capacity = service.capacity && service.capacity > 0 ? service.capacity : 1;
        if (activeAppointments + activeReservations >= capacity) {
          throw new Error('SLOT_UNAVAILABLE');
        }

        // 3. Create new reservation — safe because the advisory lock serializes
        //    every concurrent request for this exact slot
        return await tx.reservation.create({
          data: {
            user_id: userId,
            branch_id: branchId,
            service_id: serviceId,
            slot_date: targetDate,
            slot_time: normalizedTime,
            expires_at: expiresAt
          }
        });
      });

      // Invalidate availability cache for this slot
      await invalidateAvailabilityCache(branchId, serviceId, normalizedDateStr);

      // Enqueue delayed expiry job
      try {
        await getReservationExpiryQueue().add(
          'expire-reservation',
          { reservationId: reservation.id },
          { delay: 5 * 60 * 1000 }
        );
      } catch (queueErr) {
        console.error('Failed to add reservation expiry delayed job', queueErr);
      }

      res.status(201).json({
        success: true,
        data: {
          id: reservation.id,
          reservation_id: reservation.id,
          expires_at: reservation.expires_at,
          expiresAt: reservation.expires_at
        }
      });
    } catch (err: any) {
      if (err.message === 'SLOT_UNAVAILABLE' || err.code === 'P2002' || err.code === '23505') {
        res.status(409).json({
          success: false,
          error: {
            code: 'SLOT_UNAVAILABLE',
            message: 'The requested slot is already reserved or booked'
          }
        });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create reservation'
      }
    });
  }
}
