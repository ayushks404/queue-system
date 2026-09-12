import 'dotenv/config';
import { prisma } from './lib/prisma';
import { initEventBusRedis, closeEventBusRedis } from './events/bus';
import { createReservationExpiryWorker, sweepExpiredReservations } from './queues/reservationExpiry.queue';
import { createWaitlistWorker } from './queues/waitlist.queue';
import { createAppointmentRemindersWorker, sendAppointmentReminders } from './queues/appointmentReminders.queue';

async function main() {
  await prisma.$connect();
  console.log('[Worker] Connected to database');

  initEventBusRedis();

  const reservationWorker = createReservationExpiryWorker();
  console.log('[Worker] Reservation expiry worker active');

  const waitlistWorker = createWaitlistWorker();
  console.log('[Worker] Waitlist worker active');

  const reminderWorker = createAppointmentRemindersWorker();
  console.log('[Worker] Appointment reminders worker active');

  // Run initial sweep on boot
  const sweptCount = await sweepExpiredReservations();
  if (sweptCount > 0) {
    console.log(`[Worker] Initial sweep removed ${sweptCount} expired reservations`);
  }

  const reminderCount = await sendAppointmentReminders();
  if (reminderCount > 0) {
    console.log(`[Worker] Initial sweep sent ${reminderCount} appointment reminders`);
  }

  // Periodic sweeper interval every 30 seconds
  setInterval(async () => {
    try {
      await sweepExpiredReservations();
    } catch (err) {
      console.error('[Worker] Error during periodic reservation sweep:', err);
    }
  }, 30000);

  // Periodic reminder interval every 5 minutes
  setInterval(async () => {
    try {
      await sendAppointmentReminders();
    } catch (err) {
      console.error('[Worker] Error during appointment reminder sweep:', err);
    }
  }, 300000);

  const shutdown = async () => {
    console.log('[Worker] Shutting down workers...');
    await reservationWorker.close();
    await waitlistWorker.close();
    await reminderWorker.close();
    await closeEventBusRedis();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err);
  process.exit(1);
});
