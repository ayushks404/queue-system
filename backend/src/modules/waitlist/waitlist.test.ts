import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import app from '../../index';
import {
  processWaitlistForSlot,
  handleExpiredWaitlistReservation,
  closeWaitlistQueue
} from '../../queues/waitlist.queue';
import { redis } from '../../lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Step 7.1 & 7.2: POST /api/waitlist creates entry and GET /api/waitlist/:id/position returns accurate FIFO position', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Waitlist Branch', address: '123 Line St', phone: '+1234567890', is_active: true }
  });

  const service = await prisma.service.create({
    data: { name: 'Waitlist Service', duration_minutes: 30, price: 30.0, capacity: 1, is_active: true }
  });

  const user1 = await prisma.user.create({
    data: { email: `wl_user1_${Date.now()}@queue.local`, password_hash: 'hash', name: 'WL User 1', role: 'CUSTOMER' }
  });

  const user2 = await prisma.user.create({
    data: { email: `wl_user2_${Date.now()}@queue.local`, password_hash: 'hash', name: 'WL User 2', role: 'CUSTOMER' }
  });

  const user3 = await prisma.user.create({
    data: { email: `wl_user3_${Date.now()}@queue.local`, password_hash: 'hash', name: 'WL User 3', role: 'CUSTOMER' }
  });

  const token1 = generateToken(user1);
  const token2 = generateToken(user2);
  const token3 = generateToken(user3);

  const targetDateStr = '2026-10-10';

  t.after(async () => {
    await prisma.waitlist.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id, user3.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // 1. User 1 joins waitlist -> Position 1
  const res1 = await request(app)
    .post('/api/waitlist')
    .set('Authorization', `Bearer ${token1}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      requestedDate: targetDateStr
    });

  assert.strictEqual(res1.status, 201);
  assert.strictEqual(res1.body.success, true);
  assert.strictEqual(res1.body.data.user_id, user1.id);
  assert.strictEqual(res1.body.data.status, 'WAITING');
  const entry1Id = res1.body.data.id;

  // 2. User 2 joins waitlist -> Position 2
  const res2 = await request(app)
    .post('/api/waitlist')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      requestedDate: targetDateStr
    });

  assert.strictEqual(res2.status, 201);
  const entry2Id = res2.body.data.id;

  // 3. User 3 joins waitlist -> Position 3
  const res3 = await request(app)
    .post('/api/waitlist')
    .set('Authorization', `Bearer ${token3}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      requestedDate: targetDateStr
    });

  assert.strictEqual(res3.status, 201);
  const entry3Id = res3.body.data.id;

  // 4. Verify position endpoint for all 3 entries matches FIFO order
  const pos1 = await request(app)
    .get(`/api/waitlist/${entry1Id}/position`)
    .set('Authorization', `Bearer ${token1}`);
  assert.strictEqual(pos1.status, 200);
  assert.strictEqual(pos1.body.data.position, 1);

  const pos2 = await request(app)
    .get(`/api/waitlist/${entry2Id}/position`)
    .set('Authorization', `Bearer ${token2}`);
  assert.strictEqual(pos2.status, 200);
  assert.strictEqual(pos2.body.data.position, 2);

  const pos3 = await request(app)
    .get(`/api/waitlist/${entry3Id}/position`)
    .set('Authorization', `Bearer ${token3}`);
  assert.strictEqual(pos3.status, 200);
  assert.strictEqual(pos3.body.data.position, 3);
});

test('Step 7.3 & 7.4: Waitlist processing offers reservation to oldest user and advances to next user when unclaimed', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Offer Branch', address: '456 Offer Rd', phone: '+1234567890', is_active: true }
  });

  const service = await prisma.service.create({
    data: { name: 'Offer Service', duration_minutes: 30, price: 40.0, capacity: 1, is_active: true }
  });

  const userA = await prisma.user.create({
    data: { email: `wl_a_${Date.now()}@queue.local`, password_hash: 'hash', name: 'WL Candidate A', role: 'CUSTOMER' }
  });

  const userB = await prisma.user.create({
    data: { email: `wl_b_${Date.now()}@queue.local`, password_hash: 'hash', name: 'WL Candidate B', role: 'CUSTOMER' }
  });

  const targetDateStr = '2026-10-12';
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
  const slotTime = '11:00';

  // Create two waitlist entries in order: User A first, then User B
  const entryA = await prisma.waitlist.create({
    data: {
      user_id: userA.id,
      branch_id: branch.id,
      service_id: service.id,
      requested_date: targetDate,
      status: 'WAITING',
      created_at: new Date(Date.now() - 10000)
    }
  });

  const entryB = await prisma.waitlist.create({
    data: {
      user_id: userB.id,
      branch_id: branch.id,
      service_id: service.id,
      requested_date: targetDate,
      status: 'WAITING',
      created_at: new Date(Date.now() - 5000)
    }
  });

  t.after(async () => {
    await prisma.reservation.deleteMany({ where: { branch_id: branch.id } });
    await prisma.waitlist.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await closeWaitlistQueue();
    await redis.quit();
  });

  // 1. Process waitlist for slot -> Oldest user (User A) receives the OFFER and reservation
  const offerA = await processWaitlistForSlot(branch.id, service.id, targetDateStr, slotTime, 10);
  assert.ok(offerA, 'Offer A must be generated');
  assert.strictEqual(offerA.waitlistEntry.id, entryA.id);
  assert.strictEqual(offerA.waitlistEntry.status, 'OFFERED');
  assert.strictEqual(offerA.reservation.user_id, userA.id);
  assert.strictEqual(offerA.reservation.slot_time, slotTime);

  // 2. User A's reservation expires unclaimed (simulate past expires_at)
  await prisma.reservation.update({
    where: { id: offerA.reservation.id },
    data: { expires_at: new Date(Date.now() - 1000) }
  });

  // 3. handleExpiredWaitlistReservation advances to next in line (User B)
  const offerB = await handleExpiredWaitlistReservation(
    offerA.reservation.id,
    entryA.id,
    branch.id,
    service.id,
    targetDateStr,
    slotTime,
    10
  );

  assert.ok(offerB, 'Offer B must be generated for next waitlist entry');
  assert.strictEqual(offerB.waitlistEntry.id, entryB.id);
  assert.strictEqual(offerB.waitlistEntry.status, 'OFFERED');
  assert.strictEqual(offerB.reservation.user_id, userB.id);

  // Verify User A status is marked EXPIRED in DB
  const userAInDb = await prisma.waitlist.findUnique({ where: { id: entryA.id } });
  assert.strictEqual(userAInDb?.status, 'EXPIRED');
});
