import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { sendAppointmentReminders } from './appointmentReminders.queue';
import { registerNotificationSubscribers } from '../modules/notifications/notifications.events';

test('Task 28: Appointment reminders background job sweeps upcoming confirmed appointments and sends notifications once', async (t) => {
  // Ensure notification subscribers are active
  const unsubscribe = registerNotificationSubscribers();

  const user = await prisma.user.create({
    data: {
      email: `reminder_user_${Date.now()}@queue.local`,
      password_hash: 'hash',
      name: 'Reminder Test User',
      role: 'CUSTOMER'
    }
  });

  const branch = await prisma.branch.create({
    data: {
      name: 'Reminder Branch',
      address: '100 Reminder Ave',
      phone: '+15550001',
      is_active: true
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'Reminder Service',
      duration_minutes: 30,
      price: 50.00,
      capacity: 1,
      is_active: true
    }
  });

  // Calculate target date and time within the next 2 hours
  const now = new Date();
  const futureDate = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
  const year = futureDate.getFullYear();
  const month = String(futureDate.getMonth() + 1).padStart(2, '0');
  const day = String(futureDate.getDate()).padStart(2, '0');
  const hours = String(futureDate.getHours()).padStart(2, '0');
  const minutes = String(futureDate.getMinutes()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hours}:${minutes}`;

  // 1. Confirmed appointment within window
  const appt1 = await prisma.appointment.create({
    data: {
      appointment_number: `APT-REMINDER-${Date.now()}-1`,
      user_id: user.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: new Date(dateStr),
      start_time: timeStr,
      end_time: `${hours}:${String((Number(minutes) + 30) % 60).padStart(2, '0')}`,
      status: 'CONFIRMED'
    }
  });

  // 2. Far future appointment outside 24h window (3 days from now)
  const farDate = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const farDateStr = `${farDate.getFullYear()}-${String(farDate.getMonth() + 1).padStart(2, '0')}-${String(farDate.getDate()).padStart(2, '0')}`;
  const apptFar = await prisma.appointment.create({
    data: {
      appointment_number: `APT-REMINDER-${Date.now()}-FAR`,
      user_id: user.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: new Date(farDateStr),
      start_time: '12:00',
      end_time: '12:30',
      status: 'CONFIRMED'
    }
  });

  // 3. Cancelled appointment within window
  const apptCancelled = await prisma.appointment.create({
    data: {
      appointment_number: `APT-REMINDER-${Date.now()}-CAN`,
      user_id: user.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: new Date(dateStr),
      start_time: timeStr,
      end_time: `${hours}:${String((Number(minutes) + 30) % 60).padStart(2, '0')}`,
      status: 'CANCELLED'
    }
  });

  t.after(async () => {
    unsubscribe();
    await prisma.notification.deleteMany({ where: { user_id: user.id } });
    await prisma.auditLog.deleteMany({ where: { appointment_id: { in: [appt1.id, apptFar.id, apptCancelled.id] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [appt1.id, apptFar.id, apptCancelled.id] } } });
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // First sweep: should send reminder for appt1 only
  const remindedCount = await sendAppointmentReminders(24);
  assert.ok(remindedCount >= 1, 'Should send reminder for eligible appointment');

  // Allow async event subscriber to create notification
  await new Promise((resolve) => setTimeout(resolve, 300));

  const refreshedAppt1 = await prisma.appointment.findUnique({ where: { id: appt1.id } });
  assert.ok(refreshedAppt1?.reminder_sent_at !== null, 'appt1 should have reminder_sent_at timestamp');

  const refreshedFar = await prisma.appointment.findUnique({ where: { id: apptFar.id } });
  assert.strictEqual(refreshedFar?.reminder_sent_at, null, 'Far appointment should not have reminder_sent_at');

  const refreshedCancelled = await prisma.appointment.findUnique({ where: { id: apptCancelled.id } });
  assert.strictEqual(refreshedCancelled?.reminder_sent_at, null, 'Cancelled appointment should not have reminder_sent_at');

  const notifs = await prisma.notification.findMany({
    where: { user_id: user.id, type: 'APPOINTMENT_REMINDER' }
  });
  assert.ok(notifs.length >= 1, 'Should create APPOINTMENT_REMINDER notification');
  assert.ok(notifs[0].message.includes(appt1.appointment_number), 'Notification message should include appointment number');

  // Second sweep: should NOT send duplicate reminder for appt1
  const secondSweepCount = await sendAppointmentReminders(24);
  assert.strictEqual(secondSweepCount, 0, 'Second sweep should not re-send already reminded appointments');
});
