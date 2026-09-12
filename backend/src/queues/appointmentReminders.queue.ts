import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { eventBus } from '../events/bus';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

let queueInstance: Queue | null = null;

export function getAppointmentRemindersQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue('appointment-reminders', { connection });
  }
  return queueInstance;
}

export async function closeAppointmentRemindersQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

/**
 * Sweeps for CONFIRMED appointments within `hoursAhead` that have not yet had a reminder sent,
 * updates `reminder_sent_at`, and publishes `appointment.reminder` to the eventBus.
 */
export async function sendAppointmentReminders(hoursAhead: number = 24): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Fetch confirmed appointments without a reminder
  const candidates = await prisma.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      reminder_sent_at: null
    },
    include: {
      branch: { select: { id: true, name: true } },
      service: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } }
    }
  });

  let remindedCount = 0;

  for (const appt of candidates) {
    // Parse appointment_date and start_time ("HH:mm")
    const dateStr = appt.appointment_date instanceof Date
      ? appt.appointment_date.toISOString().split('T')[0]
      : String(appt.appointment_date).split('T')[0];

    const [hours, minutes] = appt.start_time.split(':').map(Number);
    const [year, month, day] = dateStr.split('-').map(Number);

    // Construct scheduled time corresponding to the appointment (in UTC)
    const apptScheduledTime = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

    // If appointment is within the upcoming window [now, windowEnd]
    if (apptScheduledTime.getTime() >= now.getTime() && apptScheduledTime.getTime() <= windowEnd.getTime()) {
      // Mark reminder as sent atomically to avoid duplicate sends
      const updated = await prisma.appointment.updateMany({
        where: {
          id: appt.id,
          reminder_sent_at: null
        },
        data: {
          reminder_sent_at: new Date()
        }
      });

      if (updated.count > 0) {
        remindedCount++;
        eventBus.publish('appointment.reminder', {
          appointmentId: appt.id,
          appointmentNumber: appt.appointment_number,
          userId: appt.user_id,
          branchId: appt.branch_id,
          serviceId: appt.service_id,
          appointmentDate: dateStr,
          startTime: appt.start_time,
          endTime: appt.end_time,
          branchName: appt.branch?.name,
          serviceName: appt.service?.name
        });
      }
    }
  }

  return remindedCount;
}

export function createAppointmentRemindersWorker() {
  const worker = new Worker(
    'appointment-reminders',
    async (_job: Job) => {
      await sendAppointmentReminders();
    },
    { connection }
  );

  return worker;
}
