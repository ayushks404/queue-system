import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { computeAvailableSlots } from './availability';

export function getAvailabilityCacheKey(branchId: string, serviceId: string, date: string): string {
  const normalizedDate = date.split('T')[0];
  return `avail:${branchId}:${serviceId}:${normalizedDate}`;
}

export async function invalidateAvailabilityCache(branchId: string, serviceId: string, date?: string): Promise<void> {
  try {
    if (date) {
      const key = getAvailabilityCacheKey(branchId, serviceId, date);
      await redis.del(key);
    } else {
      const pattern = `avail:${branchId}:${serviceId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (err) {
    console.error('Failed to invalidate availability cache', err);
  }
}

export async function getAvailability(req: Request, res: Response): Promise<void> {
  try {
    const branchId = req.query.branchId as string;
    const serviceId = req.query.serviceId as string;
    const date = req.query.date as string;

    if (!branchId || !serviceId || !date) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId, serviceId, and date query parameters are required'
        }
      });
      return;
    }

    const normalizedDate = date.split('T')[0];
    const cacheKey = getAvailabilityCacheKey(branchId, serviceId, normalizedDate);

    // 1. Check Redis cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        const parsed = JSON.parse(cached);
        res.status(200).json({
          success: true,
          data: parsed,
          from_cache: true
        });
        return;
      }
    } catch (cacheErr) {
      console.error('Redis cache read error (continuing with DB):', cacheErr);
    }

    console.log(`[Cache MISS] ${cacheKey}`);

    // 2. Fetch from DB
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        business_hours: true,
        holidays: true
      }
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

    const targetDate = new Date(`${normalizedDate}T00:00:00.000Z`);

    const appointments = await prisma.appointment.findMany({
      where: {
        branch_id: branchId,
        service_id: serviceId,
        appointment_date: targetDate,
        status: { not: 'CANCELLED' }
      },
      select: {
        start_time: true,
        status: true
      }
    });

    const activeReservations = await prisma.reservation.findMany({
      where: {
        branch_id: branchId,
        service_id: serviceId,
        slot_date: targetDate,
        expires_at: { gt: new Date() }
      },
      select: {
        slot_time: true
      }
    });

    const existingSlots = [
      ...appointments.map((a) => ({ start_time: a.start_time, status: a.status })),
      ...activeReservations.map((r) => ({ start_time: r.slot_time }))
    ];

    const availableSlots = computeAvailableSlots(
      branch,
      service,
      normalizedDate,
      existingSlots,
      branch.holidays
    );

    const responseData = {
      branch_id: branchId,
      service_id: serviceId,
      date: normalizedDate,
      available_slots: availableSlots,
      slots: availableSlots
    };

    // 3. Store in Redis cache (30s TTL)
    try {
      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 30);
    } catch (cacheSetErr) {
      console.error('Redis cache write error:', cacheSetErr);
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to compute availability'
      }
    });
  }
}
