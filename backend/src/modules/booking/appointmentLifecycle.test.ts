import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import app from '../../index';
import { canTransition } from './appointmentStateMachine';
import { redis } from '../../lib/redis';
import { invalidateAvailabilityCache } from './availability.controller';
import { closeWaitlistQueue } from '../../queues/waitlist.queue';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Step 6.1: canTransition validates all state machine transitions correctly', () => {
  // Valid transitions
  assert.strictEqual(canTransition('CONFIRMED', 'CHECKED_IN'), true);
  assert.strictEqual(canTransition('CONFIRMED', 'CANCELLED'), true);
  assert.strictEqual(canTransition('CONFIRMED', 'NO_SHOW'), true);
  assert.strictEqual(canTransition('CHECKED_IN', 'IN_PROGRESS'), true);
  assert.strictEqual(canTransition('CHECKED_IN', 'NO_SHOW'), true);
  assert.strictEqual(canTransition('IN_PROGRESS', 'COMPLETED'), true);

  // Invalid transitions
  assert.strictEqual(canTransition('PENDING', 'CONFIRMED'), false);
  assert.strictEqual(canTransition('PENDING', 'CANCELLED'), false);
  assert.strictEqual(canTransition('CONFIRMED', 'IN_PROGRESS'), false);
  assert.strictEqual(canTransition('CONFIRMED', 'COMPLETED'), false);
  assert.strictEqual(canTransition('CHECKED_IN', 'CONFIRMED'), false);
  assert.strictEqual(canTransition('CHECKED_IN', 'COMPLETED'), false);
  assert.strictEqual(canTransition('IN_PROGRESS', 'CONFIRMED'), false);
  assert.strictEqual(canTransition('IN_PROGRESS', 'CANCELLED'), false);
  assert.strictEqual(canTransition('COMPLETED', 'CONFIRMED'), false);
  assert.strictEqual(canTransition('COMPLETED', 'CANCELLED'), false);
  assert.strictEqual(canTransition('CANCELLED', 'CONFIRMED'), false);
  assert.strictEqual(canTransition('NO_SHOW', 'CONFIRMED'), false);
});

test('Step 6.2: Staff PATCH /api/appointments/:id/status enforces transitions and audit logging, blocks non-staff', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Status Branch', address: '123 Status St', phone: '+1234567890', is_active: true }
  });

  const service = await prisma.service.create({
    data: { name: 'Status Service', duration_minutes: 30, price: 50.0, capacity: 1, is_active: true }
  });

  const customer = await prisma.user.create({
    data: { email: `cust_stat_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Cust Stat', role: 'CUSTOMER' }
  });

  const staff = await prisma.user.create({
    data: { email: `staff_stat_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff Stat', role: 'STAFF' }
  });

  const appt = await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-990001`,
      user_id: customer.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: new Date('2026-09-30T00:00:00.000Z'),
      start_time: '10:00',
      end_time: '10:30',
      status: 'CONFIRMED'
    }
  });

  const customerToken = generateToken(customer);
  const staffToken = generateToken(staff);

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { appointment_id: appt.id } });
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, staff.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // 1. Customer role is rejected with 403
  const resForbidden = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ status: 'CHECKED_IN' });
  assert.strictEqual(resForbidden.status, 403);

  // 2. Invalid status transition (CONFIRMED -> COMPLETED) is rejected with 400 INVALID_STATUS_TRANSITION
  const resInvalid = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'COMPLETED' });
  assert.strictEqual(resInvalid.status, 400);
  assert.strictEqual(resInvalid.body.error.code, 'INVALID_STATUS_TRANSITION');

  const auditLogsAfterInvalid = await prisma.auditLog.findMany({ where: { appointment_id: appt.id } });
  assert.strictEqual(auditLogsAfterInvalid.length, 0, 'No audit log must be written on invalid transition');

  // 3. Valid transition (CONFIRMED -> CHECKED_IN)
  const resValid1 = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'CHECKED_IN' });
  assert.strictEqual(resValid1.status, 200);
  assert.strictEqual(resValid1.body.data.status, 'CHECKED_IN');

  // 4. Valid transition (CHECKED_IN -> IN_PROGRESS)
  const resValid2 = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'IN_PROGRESS' });
  assert.strictEqual(resValid2.status, 200);
  assert.strictEqual(resValid2.body.data.status, 'IN_PROGRESS');

  // 5. Valid transition (IN_PROGRESS -> COMPLETED)
  const resValid3 = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'COMPLETED' });
  assert.strictEqual(resValid3.status, 200);
  assert.strictEqual(resValid3.body.data.status, 'COMPLETED');

  // Verify all audit logs were written
  const auditLogs = await prisma.auditLog.findMany({
    where: { appointment_id: appt.id },
    orderBy: { created_at: 'asc' }
  });
  assert.strictEqual(auditLogs.length, 3);
  assert.strictEqual(auditLogs[0].new_status, 'CHECKED_IN');
  assert.strictEqual(auditLogs[1].new_status, 'IN_PROGRESS');
  assert.strictEqual(auditLogs[2].new_status, 'COMPLETED');
});

test('Step 6.3: PATCH /api/appointments/:id/cancel releases slot and makes it reappear in GET /api/availability', async (t) => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Cancel Test Branch',
      address: '456 Cancel Ave',
      phone: '+1234567890',
      is_active: true,
      business_hours: {
        create: [
          { day_of_week: 3, open_time: '09:00', close_time: '11:00' } // Wednesday
        ]
      }
    }
  });

  const service = await prisma.service.create({
    data: { name: 'Cancel Service', duration_minutes: 30, price: 45.0, capacity: 1, is_active: true }
  });

  const customer = await prisma.user.create({
    data: { email: `cust_canc_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Cust Cancel', role: 'CUSTOMER' }
  });

  const targetDateStr = '2026-09-16'; // Wednesday
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  const appt = await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-990002`,
      user_id: customer.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: targetDate,
      start_time: '09:00',
      end_time: '09:30',
      status: 'CONFIRMED'
    }
  });

  const customerToken = generateToken(customer);

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { appointment_id: appt.id } });
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.businessHour.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.delete({ where: { id: customer.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await closeWaitlistQueue();
  });

  // 1. Initial availability check: 09:00 is taken, so only 09:30, 10:00, 10:30 available
  await invalidateAvailabilityCache(branch.id, service.id, targetDateStr);
  const availBefore = await request(app)
    .get(`/api/availability?branchId=${branch.id}&serviceId=${service.id}&date=${targetDateStr}`);
  assert.strictEqual(availBefore.status, 200);
  assert.strictEqual(availBefore.body.data.available_slots.includes('09:00'), false);

  // 2. Customer cancels their appointment
  const resCancel = await request(app)
    .patch(`/api/appointments/${appt.id}/cancel`)
    .set('Authorization', `Bearer ${customerToken}`);
  assert.strictEqual(resCancel.status, 200);
  assert.strictEqual(resCancel.body.data.status, 'CANCELLED');

  // 3. Confirm 09:00 slot reappears in availability immediately
  const availAfter = await request(app)
    .get(`/api/availability?branchId=${branch.id}&serviceId=${service.id}&date=${targetDateStr}`);
  assert.strictEqual(availAfter.status, 200);
  assert.strictEqual(availAfter.body.data.available_slots.includes('09:00'), true);
});

test('Step 6.4: PATCH /api/appointments/:id/reschedule (a) succeeds when new slot is available and (b) makes NO change when new slot is unavailable', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Reschedule Branch', address: '789 Resched Rd', phone: '+1234567890', is_active: true }
  });

  const service = await prisma.service.create({
    data: { name: 'Reschedule Service', duration_minutes: 30, price: 60.0, capacity: 1, is_active: true }
  });

  const userA = await prisma.user.create({
    data: { email: `user_a_${Date.now()}@queue.local`, password_hash: 'hash', name: 'User A', role: 'CUSTOMER' }
  });

  const userB = await prisma.user.create({
    data: { email: `user_b_${Date.now()}@queue.local`, password_hash: 'hash', name: 'User B', role: 'CUSTOMER' }
  });

  const dateA = new Date('2026-10-01T00:00:00.000Z');
  const dateB = new Date('2026-10-02T00:00:00.000Z');

  // User A has appointment on Oct 1 at 09:00
  const apptA = await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-990003`,
      user_id: userA.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: dateA,
      start_time: '09:00',
      end_time: '09:30',
      status: 'CONFIRMED'
    }
  });

  // User B already occupies Oct 2 at 10:00
  const apptB = await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-990004`,
      user_id: userB.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: dateB,
      start_time: '10:00',
      end_time: '10:30',
      status: 'CONFIRMED'
    }
  });

  const tokenA = generateToken(userA);

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { appointment_id: { in: [apptA.id, apptB.id] } } });
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // Case (b): Try rescheduling to User B's slot (Oct 2, 10:00) -> 409 SLOT_UNAVAILABLE and NO change made
  const resConflict = await request(app)
    .patch(`/api/appointments/${apptA.id}/reschedule`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      newSlotDate: '2026-10-02',
      newSlotTime: '10:00'
    });

  assert.strictEqual(resConflict.status, 409);
  assert.strictEqual(resConflict.body.error.code, 'SLOT_UNAVAILABLE');

  // Verify apptA remained 100% unchanged in DB
  const apptAUnchanged = await prisma.appointment.findUnique({ where: { id: apptA.id } });
  assert.strictEqual(apptAUnchanged?.start_time, '09:00');
  assert.strictEqual(apptAUnchanged?.appointment_date.toISOString().split('T')[0], '2026-10-01');

  // Case (a): Reschedule to available slot (Oct 2, 11:00) -> 200 OK, changes applied
  const resSuccess = await request(app)
    .patch(`/api/appointments/${apptA.id}/reschedule`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      newSlotDate: '2026-10-02',
      newSlotTime: '11:00'
    });

  assert.strictEqual(resSuccess.status, 200);
  assert.strictEqual(resSuccess.body.data.start_time, '11:00');
  assert.strictEqual(resSuccess.body.data.end_time, '11:30');
  assert.strictEqual(new Date(resSuccess.body.data.appointment_date).toISOString().split('T')[0], '2026-10-02');

  // Verify DB updated and audit log written
  const apptAUpdated = await prisma.appointment.findUnique({ where: { id: apptA.id } });
  assert.strictEqual(apptAUpdated?.start_time, '11:00');

  const auditLog = await prisma.auditLog.findFirst({
    where: { appointment_id: apptA.id, action: 'APPOINTMENT_RESCHEDULED' }
  });
  assert.ok(auditLog, 'Audit log for rescheduling must exist');
});

test('Step 6.5: No-show handling updates status to NO_SHOW, logs audit, and frees the slot', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'NoShow Branch', address: '111 NoShow Rd', phone: '+1234567890', is_active: true }
  });

  const service = await prisma.service.create({
    data: { name: 'NoShow Service', duration_minutes: 30, price: 40.0, capacity: 1, is_active: true }
  });

  const customer = await prisma.user.create({
    data: { email: `cust_noshow_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Cust NoShow', role: 'CUSTOMER' }
  });

  const staff = await prisma.user.create({
    data: { email: `staff_noshow_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff NoShow', role: 'STAFF' }
  });

  const appt = await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-990005`,
      user_id: customer.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: new Date('2026-10-05T00:00:00.000Z'),
      start_time: '14:00',
      end_time: '14:30',
      status: 'CONFIRMED'
    }
  });

  const staffToken = generateToken(staff);

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { appointment_id: appt.id } });
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, staff.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await closeWaitlistQueue();
    await redis.quit();
  });

  // Staff marks appointment as NO_SHOW
  const resNoShow = await request(app)
    .patch(`/api/appointments/${appt.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'NO_SHOW' });

  assert.strictEqual(resNoShow.status, 200);
  assert.strictEqual(resNoShow.body.data.status, 'NO_SHOW');

  const auditLog = await prisma.auditLog.findFirst({
    where: { appointment_id: appt.id, action: 'APPOINTMENT_NO_SHOW' }
  });
  assert.ok(auditLog, 'Audit log for NO_SHOW must exist');
  assert.strictEqual(auditLog?.new_status, 'NO_SHOW');
});
