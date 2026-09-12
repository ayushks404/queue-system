import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { eventBus } from '../events/bus';
import { invalidateAvailabilityCache } from '../modules/booking/availability.controller';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

let waitlistQueueInstance: Queue | null = null;

export function getWaitlistQueue(): Queue {
  if (!waitlistQueueInstance) {
    waitlistQueueInstance = new Queue('waitlist-process', { connection });
  }
  return waitlistQueueInstance;
}

export async function closeWaitlistQueue(): Promise<void> {
  if (waitlistQueueInstance) {
    await waitlistQueueInstance.close();
    waitlistQueueInstance = null;
  }
}

export async function processWaitlistForSlot(
  branchId: string,
  serviceId: string,
  dateStr: string,
  slotTime: string,
  expiryMinutes = 10
): Promise<{ waitlistEntry: any; reservation: any } | null> {
  const normalizedDateStr = dateStr.split('T')[0];
  const targetDate = new Date(`${normalizedDateStr}T00:00:00.000Z`);
  const normalizedTime = slotTime.slice(0, 5);

  // Ordering rule:
  // 1. Prefer oldest WAITING entry whose requested_time matches the freed slot time, or is null ("any time").
  // 2. Fall back to oldest WAITING entry for the target date (strict FIFO) if no specific time match exists.
  let matchingEntry = await prisma.waitlist.findFirst({
    where: {
      branch_id: branchId,
      service_id: serviceId,
      requested_date: targetDate,
      status: 'WAITING',
      OR: [
        { requested_time: normalizedTime },
        { requested_time: null }
      ]
    },
    orderBy: { created_at: 'asc' }
  });

  if (!matchingEntry) {
    matchingEntry = await prisma.waitlist.findFirst({
      where: {
        branch_id: branchId,
        service_id: serviceId,
        requested_date: targetDate,
        status: 'WAITING'
      },
      orderBy: { created_at: 'asc' }
    });
  }

  if (!matchingEntry) {
    return null;
  }

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({ where: { id: serviceId } });
      if (!service) throw new Error('SERVICE_NOT_FOUND');

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${branchId} || ${serviceId} || ${normalizedDateStr} || ${normalizedTime}))
      `;

      // 1. Delete any expired reservations for this slot
      await tx.reservation.deleteMany({
        where: {
          branch_id: branchId,
          service_id: serviceId,
          slot_date: targetDate,
          slot_time: normalizedTime,
          expires_at: { lte: new Date() }
        }
      });

      const activeAppointments = await tx.appointment.count({
        where: {
          branch_id: branchId, service_id: serviceId, appointment_date: targetDate,
          start_time: normalizedTime, status: { not: 'CANCELLED' }
        }
      });
      const activeReservations = await tx.reservation.count({
        where: {
          branch_id: branchId, service_id: serviceId, slot_date: targetDate,
          slot_time: normalizedTime, expires_at: { gt: new Date() }
        }
      });
      const capacity = service.capacity && service.capacity > 0 ? service.capacity : 1;
      if (activeAppointments + activeReservations >= capacity) {
        // No room yet — leave WAITING, a later cancellation/no-show will retry this
        throw new Error('NO_CAPACITY');
      }

      // 2. Create reservation for this waitlist user
      const reservation = await tx.reservation.create({
        data: {
          user_id: matchingEntry.user_id,
          branch_id: branchId,
          service_id: serviceId,
          slot_date: targetDate,
          slot_time: normalizedTime,
          expires_at: expiresAt
        }
      });

      // 3. Mark waitlist status as OFFERED and link the reservation it was offered
      const updatedEntry = await tx.waitlist.update({
        where: { id: matchingEntry.id },
        data: { status: 'OFFERED', reservation_id: reservation.id }
      });

      return { waitlistEntry: updatedEntry, reservation };
    });

    await invalidateAvailabilityCache(branchId, serviceId, normalizedDateStr);

    eventBus.publish('waitlist.offered', {
      waitlistId: result.waitlistEntry.id,
      userId: result.waitlistEntry.user_id,
      reservationId: result.reservation.id,
      branchId,
      serviceId,
      slotDate: normalizedDateStr,
      slotTime: normalizedTime,
      expiresAt
    });

    return result;
  } catch (err) {
    console.error('Failed to create waitlist reservation offer:', err);
    return null;
  }
}

export async function handleExpiredWaitlistReservation(
  reservationId: string,
  waitlistId: string,
  branchId: string,
  serviceId: string,
  dateStr: string,
  slotTime: string,
  expiryMinutes = 10
): Promise<{ waitlistEntry: any; reservation: any } | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId }
  });

  // If reservation still exists (unclaimed) and is expired
  if (reservation && reservation.expires_at <= new Date()) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.delete({ where: { id: reservationId } });
      await tx.waitlist.update({
        where: { id: waitlistId },
        data: { status: 'EXPIRED' }
      });
    });

    // Advance to next waitlist candidate
    return await processWaitlistForSlot(branchId, serviceId, dateStr, slotTime, expiryMinutes);
  }

  return null;
}

export function createWaitlistWorker() {
  const worker = new Worker(
    'waitlist-process',
    async (job: Job) => {
      const { branchId, serviceId, date, slotTime, expiryMinutes } = job.data;
      if (branchId && serviceId && date && slotTime) {
        await processWaitlistForSlot(branchId, serviceId, date, slotTime, expiryMinutes);
      }
    },
    { connection }
  );

  return worker;
}
