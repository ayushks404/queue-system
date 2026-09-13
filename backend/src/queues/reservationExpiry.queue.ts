import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { invalidateAvailabilityCache } from '../modules/booking/availability.controller';
import { handleExpiredWaitlistReservation } from './waitlist.queue';
import { bullmqConnection as connection } from '../lib/redis';

let queueInstance: Queue | null = null;

export function getReservationExpiryQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue('reservation-expiry', { connection });
  }
  return queueInstance;
}

export async function closeReservationExpiryQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

export async function sweepExpiredReservations(): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      expires_at: { lte: new Date() }
    }
  });

  if (expired.length > 0) {
    for (const item of expired) {
      const linkedWaitlist = await prisma.waitlist.findFirst({
        where: { reservation_id: item.id }
      });

      if (linkedWaitlist) {
        await handleExpiredWaitlistReservation(
          item.id,
          linkedWaitlist.id,
          item.branch_id,
          item.service_id,
          item.slot_date.toISOString().split('T')[0],
          item.slot_time
        );
      } else {
        await prisma.reservation.delete({
          where: { id: item.id }
        }).catch(() => {});
      }

      await invalidateAvailabilityCache(
        item.branch_id,
        item.service_id,
        item.slot_date.toISOString().split('T')[0]
      );
    }
  }

  return expired.length;
}

export function createReservationExpiryWorker() {
  const worker = new Worker(
    'reservation-expiry',
    async (job: Job) => {
      const { reservationId } = job.data;
      if (!reservationId) {
        await sweepExpiredReservations();
        return;
      }

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId }
      });

      if (reservation && reservation.expires_at <= new Date()) {
        const linkedWaitlist = await prisma.waitlist.findFirst({
          where: { reservation_id: reservation.id }
        });

        if (linkedWaitlist) {
          await handleExpiredWaitlistReservation(
            reservation.id,
            linkedWaitlist.id,
            reservation.branch_id,
            reservation.service_id,
            reservation.slot_date.toISOString().split('T')[0],
            reservation.slot_time
          );
        } else {
          await prisma.reservation.delete({
            where: { id: reservationId }
          }).catch(() => {});
        }

        await invalidateAvailabilityCache(
          reservation.branch_id,
          reservation.service_id,
          reservation.slot_date.toISOString().split('T')[0]
        );
      }
    },
    { connection }
  );

  return worker;
}
