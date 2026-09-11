import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { invalidateAvailabilityCache } from '../modules/booking/availability.controller';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

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
    const ids = expired.map((r) => r.id);
    await prisma.reservation.deleteMany({
      where: { id: { in: ids } }
    });

    for (const item of expired) {
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
        await prisma.reservation.delete({
          where: { id: reservationId }
        });
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
