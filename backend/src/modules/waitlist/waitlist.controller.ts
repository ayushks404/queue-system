import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { confirmReservationForUser } from '../booking/appointments.controller';

export async function joinWaitlist(req: Request, res: Response): Promise<void> {
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
    const requestedDate =
      req.body.requestedDate || req.body.requested_date || req.body.date ||
      req.body.preferred_date || req.body.preferredDate;

    if (!branchId || !serviceId || !requestedDate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId, serviceId, and requestedDate are required'
        }
      });
      return;
    }

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

    const normalizedDateStr =
      typeof requestedDate === 'string'
        ? requestedDate.split('T')[0]
        : new Date(requestedDate).toISOString().split('T')[0];
    const targetDate = new Date(`${normalizedDateStr}T00:00:00.000Z`);

    // Check if user already waiting
    const existing = await prisma.waitlist.findFirst({
      where: {
        user_id: userId,
        branch_id: branchId,
        service_id: serviceId,
        requested_date: targetDate,
        status: { in: ['WAITING', 'OFFERED'] }
      }
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'You are already on the waitlist for this service and date'
        }
      });
      return;
    }

    const requestedTime =
      req.body.requestedTime || req.body.requested_time || req.body.preferredTime ||
      req.body.preferred_time || req.body.time;

    const entry = await prisma.waitlist.create({
      data: {
        user_id: userId,
        branch_id: branchId,
        service_id: serviceId,
        requested_date: targetDate,
        requested_time: requestedTime ? requestedTime.slice(0, 5) : null,
        status: 'WAITING'
      },
      include: {
        branch: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, duration_minutes: true } }
      }
    });

    res.status(201).json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Error joining waitlist:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to join waitlist'
      }
    });
  }
}

export async function getWaitlistPosition(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { id } = req.params;

    const entry = await prisma.waitlist.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, duration_minutes: true } }
      }
    });

    if (!entry) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Waitlist entry not found'
        }
      });
      return;
    }

    if (userRole === 'CUSTOMER' && entry.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    if (entry.status !== 'WAITING') {
      res.status(200).json({
        success: true,
        data: {
          id: entry.id,
          status: entry.status,
          position: 0,
          estimated_wait_minutes: 0,
          created_at: entry.created_at
        }
      });
      return;
    }

    // Compute FIFO position by counting entries created on or before this entry
    const position = await prisma.waitlist.count({
      where: {
        branch_id: entry.branch_id,
        service_id: entry.service_id,
        requested_date: entry.requested_date,
        status: 'WAITING',
        created_at: { lte: entry.created_at }
      }
    });

    const duration = entry.service?.duration_minutes || 30;
    const estimated_wait_minutes = position * duration;

    res.status(200).json({
      success: true,
      data: {
        id: entry.id,
        branch_id: entry.branch_id,
        service_id: entry.service_id,
        requested_date: entry.requested_date,
        requested_time: entry.requested_time,
        status: entry.status,
        position,
        estimated_wait_minutes,
        created_at: entry.created_at
      }
    });
  } catch (error) {
    console.error('Error fetching waitlist position:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch waitlist position'
      }
    });
  }
}

export async function getUserWaitlists(req: Request, res: Response): Promise<void> {
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

    const waitlists = await prisma.waitlist.findMany({
      where: { user_id: userId },
      include: {
        branch: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: waitlists
    });
  } catch (error) {
    console.error('Error fetching user waitlists:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch waitlist'
      }
    });
  }
}

export async function cancelWaitlistEntry(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { id } = req.params;

    const entry = await prisma.waitlist.findUnique({
      where: { id }
    });

    if (!entry) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Waitlist entry not found'
        }
      });
      return;
    }

    if (userRole === 'CUSTOMER' && entry.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    const updated = await prisma.waitlist.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error cancelling waitlist entry:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel waitlist entry'
      }
    });
  }
}

export async function acceptWaitlistOffer(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const entry = await prisma.waitlist.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' } });
      return;
    }
    if (entry.user_id !== userId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }
    if (entry.status !== 'OFFERED' || !entry.reservation_id) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'This waitlist entry has no active offer' } });
      return;
    }

    const { appointment } = await confirmReservationForUser(entry.reservation_id, userId, {});
    await prisma.waitlist.update({ where: { id }, data: { status: 'CONFIRMED' } });

    res.status(201).json({ success: true, data: appointment });
  } catch (err: any) {
    if (err.message === 'RESERVATION_EXPIRED') {
      res.status(400).json({ success: false, error: { code: 'RESERVATION_EXPIRED', message: 'The offered slot has expired' } });
      return;
    }
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
      return;
    }
    console.error('Error accepting waitlist offer:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to accept offer' } });
  }
}
