import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import app from '../../index';
import { eventBus } from '../../events/bus';
import { registerNotificationSubscribers } from './notifications.events';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Step 10.1: Notifications decouple from business logic and create rows on all 7 bus events', async (t) => {
  const user = await prisma.user.create({
    data: { email: `notif_u1_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Notif User 1', role: 'CUSTOMER' }
  });

  t.after(async () => {
    await prisma.notification.deleteMany({ where: { user_id: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // 1. appointment.confirmed
  eventBus.publish('appointment.confirmed', {
    userId: user.id,
    appointmentNumber: 'APT-2026-123456'
  });

  // 2. appointment.cancelled
  eventBus.publish('appointment.cancelled', {
    userId: user.id
  });

  // 3. appointment.rescheduled
  eventBus.publish('appointment.rescheduled', {
    userId: user.id,
    newDate: '2026-10-15',
    newTime: '10:00'
  });

  // 4. waitlist.offered
  eventBus.publish('waitlist.offered', {
    userId: user.id,
    slotDate: '2026-10-15',
    slotTime: '10:00'
  });

  // 5. queue.position_changed
  eventBus.publish('queue.position_changed', {
    userId: user.id,
    position: 2
  });

  // 6. queue.called
  eventBus.publish('queue.called', {
    userId: user.id,
    queueNumber: 7
  });

  // 7. appointment.completed
  eventBus.publish('appointment.completed', {
    userId: user.id
  });

  // Allow async subscriber processing
  await new Promise((resolve) => setTimeout(resolve, 200));

  const notifs = await prisma.notification.findMany({
    where: { user_id: user.id }
  });

  assert.strictEqual(notifs.length, 7, 'All 7 event types must produce a notification row');
  const types = notifs.map((n) => n.type);
  assert.ok(types.includes('APPOINTMENT_CONFIRMED'));
  assert.ok(types.includes('APPOINTMENT_CANCELLED'));
  assert.ok(types.includes('APPOINTMENT_RESCHEDULED'));
  assert.ok(types.includes('WAITLIST_OFFERED'));
  assert.ok(types.includes('QUEUE_POSITION_CHANGED'));
  assert.ok(types.includes('QUEUE_CALLED'));
  assert.ok(types.includes('APPOINTMENT_COMPLETED'));
});

test('Step 10.1 (b): Disabling notification subscribers does NOT break core operations (proving decoupling)', async (t) => {
  // Unsubscribe all notification listeners temporarily
  const cleanup = registerNotificationSubscribers();
  cleanup(); // Invoking unsubscribe immediately removes listeners

  const branch = await prisma.branch.create({
    data: { name: 'Decouple Branch', address: '123 Decouple Rd', phone: '+1234567890', is_active: true }
  });

  const staff = await prisma.user.create({
    data: { email: `staff_dec_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff Dec', role: 'STAFF' }
  });

  const staffToken = generateToken(staff);

  t.after(async () => {
    await prisma.queueEntry.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    // Re-register subscribers for subsequent tests
    registerNotificationSubscribers();
  });

  // Queue walk-in still succeeds with zero errors even if notifications are completely detached
  const res = await request(app)
    .post('/api/queue/walk-in')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({
      branchId: branch.id,
      customerName: 'Decoupled Customer'
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.customer_name, 'Decoupled Customer');
});

test('Step 10.2: GET /api/notifications returns correctly scoped and paginated user notifications', async (t) => {
  const userA = await prisma.user.create({
    data: { email: `notif_ua_${Date.now()}@queue.local`, password_hash: 'hash', name: 'User A Notif', role: 'CUSTOMER' }
  });

  const userB = await prisma.user.create({
    data: { email: `notif_ub_${Date.now()}@queue.local`, password_hash: 'hash', name: 'User B Notif', role: 'CUSTOMER' }
  });

  const tokenA = generateToken(userA);

  // Populate 15 notifications for User A, 5 for User B
  const userANotifs = Array.from({ length: 15 }).map((_, i) => ({
    user_id: userA.id,
    type: 'APPOINTMENT_CONFIRMED',
    message: `Notification ${i + 1} for User A`,
    is_read: i >= 10 // 10 unread, 5 read
  }));

  const userBNotifs = Array.from({ length: 5 }).map((_, i) => ({
    user_id: userB.id,
    type: 'APPOINTMENT_CONFIRMED',
    message: `Notification ${i + 1} for User B`,
    is_read: false
  }));

  await prisma.notification.createMany({ data: [...userANotifs, ...userBNotifs] });

  t.after(async () => {
    await prisma.notification.deleteMany({ where: { user_id: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  // Page 1, limit 10: Returns 10 notifications for User A only
  const resPage1 = await request(app)
    .get('/api/notifications?page=1&limit=10')
    .set('Authorization', `Bearer ${tokenA}`);

  assert.strictEqual(resPage1.status, 200);
  assert.strictEqual(resPage1.body.success, true);
  assert.strictEqual(resPage1.body.data.notifications.length, 10);
  assert.strictEqual(resPage1.body.data.pagination.total, 15);
  assert.strictEqual(resPage1.body.data.pagination.totalPages, 2);
  assert.strictEqual(resPage1.body.data.pagination.page, 1);
  assert.strictEqual(resPage1.body.data.pagination.unreadCount, 10);

  // Verify none of User B's notifications were returned
  for (const n of resPage1.body.data.notifications) {
    assert.strictEqual(n.user_id, userA.id);
  }

  // Page 2, limit 10: Returns remaining 5 notifications
  const resPage2 = await request(app)
    .get('/api/notifications?page=2&limit=10')
    .set('Authorization', `Bearer ${tokenA}`);

  assert.strictEqual(resPage2.status, 200);
  assert.strictEqual(resPage2.body.data.notifications.length, 5);

  // Mark all as read
  const resMarkAll = await request(app)
    .patch('/api/notifications/read-all')
    .set('Authorization', `Bearer ${tokenA}`);

  assert.strictEqual(resMarkAll.status, 200);

  const resAfterMark = await request(app)
    .get('/api/notifications?page=1&limit=10')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(resAfterMark.body.data.pagination.unreadCount, 0);
});
