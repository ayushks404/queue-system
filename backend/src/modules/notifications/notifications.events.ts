import { prisma } from '../../lib/prisma';
import { eventBus } from '../../events/bus';

export function registerNotificationSubscribers(): () => void {
  const unsubscribers: Array<() => void> = [];

  const addSub = (event: string, handler: (payload: any) => Promise<void>) => {
    const unsub = eventBus.subscribe(event, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`Error processing notification for event ${event}:`, err);
      }
    });
    unsubscribers.push(unsub);
  };

  // 1. appointment.confirmed
  addSub('appointment.confirmed', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'APPOINTMENT_CONFIRMED',
        message: `Your appointment ${data.appointmentNumber || ''} is confirmed.`
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 2. appointment.cancelled
  addSub('appointment.cancelled', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'APPOINTMENT_CANCELLED',
        message: 'Your appointment has been cancelled.'
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 3. appointment.rescheduled
  addSub('appointment.rescheduled', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'APPOINTMENT_RESCHEDULED',
        message: `Your appointment has been rescheduled to ${data.newDate} at ${data.newTime}.`
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 4. waitlist.offered
  addSub('waitlist.offered', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'WAITLIST_OFFERED',
        message: `A slot is available for you on ${data.slotDate} at ${data.slotTime}. Please confirm your booking.`
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 5. queue.position_changed
  addSub('queue.position_changed', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'QUEUE_POSITION_CHANGED',
        message: `Your queue position is now #${data.position}.`
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 6. queue.called
  addSub('queue.called', async (data) => {
    const userId = data.userId;
    if (!userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: userId,
        type: 'QUEUE_CALLED',
        message: `Your queue ticket #${data.queueNumber} has been called.`
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  // 7. appointment.completed
  addSub('appointment.completed', async (data) => {
    if (!data.userId) return;
    const notif = await prisma.notification.create({
      data: {
        user_id: data.userId,
        type: 'APPOINTMENT_COMPLETED',
        message: 'Your appointment has been marked completed. Thank you!'
      }
    });
    eventBus.publish('notification.created', {
      userId: notif.user_id,
      id: notif.id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.created_at
    });
  });

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
