import { eventBus } from '../../events/bus';
import { getWaitlistQueue } from '../../queues/waitlist.queue';

export function registerWaitlistEventSubscribers() {
  eventBus.subscribe('appointment.cancelled', async (data) => {
    try {
      const dateStr =
        typeof data.appointmentDate === 'string'
          ? data.appointmentDate
          : data.appointmentDate.toISOString().split('T')[0];

      await getWaitlistQueue().add('process-waitlist', {
        branchId: data.branchId,
        serviceId: data.serviceId,
        date: dateStr,
        slotTime: data.startTime
      });
    } catch (err) {
      console.error('Error queueing waitlist job on cancellation:', err);
    }
  });

  eventBus.subscribe('appointment.no_show', async (data) => {
    try {
      const dateStr =
        typeof data.appointmentDate === 'string'
          ? data.appointmentDate
          : data.appointmentDate.toISOString().split('T')[0];

      await getWaitlistQueue().add('process-waitlist', {
        branchId: data.branchId,
        serviceId: data.serviceId,
        date: dateStr,
        slotTime: data.startTime
      });
    } catch (err) {
      console.error('Error queueing waitlist job on no-show:', err);
    }
  });
}
