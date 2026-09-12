import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import app from '../../index';
import { canQueueTransition } from './queueStateMachine';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Step 8.1: POST /api/queue/walk-in auto-increments queue_number per branch per day sequentially', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Queue Branch 1', address: '123 Line Rd', phone: '+1234567890', is_active: true }
  });

  const staff = await prisma.user.create({
    data: { email: `staff_q1_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff Q1', role: 'STAFF' }
  });

  const staffToken = generateToken(staff);

  t.after(async () => {
    await prisma.queueEntry.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
  });

  // 1. Walk-in 1 -> queue_number 1
  const res1 = await request(app)
    .post('/api/queue/walk-in')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({
      branchId: branch.id,
      customerName: 'Alice Walkin',
      priority: 'NORMAL'
    });

  assert.strictEqual(res1.status, 201);
  assert.strictEqual(res1.body.data.queue_number, 1);
  assert.strictEqual(res1.body.data.status, 'WAITING');

  // 2. Walk-in 2 -> queue_number 2
  const res2 = await request(app)
    .post('/api/queue/walk-in')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({
      branchId: branch.id,
      customerName: 'Bob Walkin',
      priority: 'PRIORITY'
    });

  assert.strictEqual(res2.status, 201);
  assert.strictEqual(res2.body.data.queue_number, 2);

  // 3. Walk-in 3 -> queue_number 3
  const res3 = await request(app)
    .post('/api/queue/walk-in')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({
      branchId: branch.id,
      customerName: 'Charlie Walkin',
      priority: 'EMERGENCY'
    });

  assert.strictEqual(res3.status, 201);
  assert.strictEqual(res3.body.data.queue_number, 3);
});

test('Step 8.2: Queue state machine and PATCH /api/queue/:id/status enforce transitions', async (t) => {
  // Pure transition tests
  assert.strictEqual(canQueueTransition('WAITING', 'CALLED'), true);
  assert.strictEqual(canQueueTransition('WAITING', 'CANCELLED'), true);
  assert.strictEqual(canQueueTransition('CALLED', 'IN_PROGRESS'), true);
  assert.strictEqual(canQueueTransition('CALLED', 'SKIPPED'), true);
  assert.strictEqual(canQueueTransition('CALLED', 'CANCELLED'), true);
  assert.strictEqual(canQueueTransition('IN_PROGRESS', 'COMPLETED'), true);
  assert.strictEqual(canQueueTransition('SKIPPED', 'WAITING'), true);
  assert.strictEqual(canQueueTransition('SKIPPED', 'CALLED'), true);

  // Invalid transitions
  assert.strictEqual(canQueueTransition('WAITING', 'COMPLETED'), false);
  assert.strictEqual(canQueueTransition('WAITING', 'IN_PROGRESS'), false);
  assert.strictEqual(canQueueTransition('COMPLETED', 'WAITING'), false);
  assert.strictEqual(canQueueTransition('COMPLETED', 'CALLED'), false);

  // API test
  const branch = await prisma.branch.create({
    data: { name: 'Queue Status Branch', address: '456 Status Rd', phone: '+1234567890', is_active: true }
  });

  const staff = await prisma.user.create({
    data: { email: `staff_qs_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff QS', role: 'STAFF' }
  });

  const entry = await prisma.queueEntry.create({
    data: {
      branch_id: branch.id,
      customer_name: 'Status Test User',
      queue_number: 1,
      status: 'WAITING',
      priority: 'NORMAL',
      priority_rank: 1
    }
  });

  const staffToken = generateToken(staff);

  t.after(async () => {
    await prisma.queueEntry.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
  });

  // Invalid: WAITING -> COMPLETED rejected
  const resInvalid = await request(app)
    .patch(`/api/queue/${entry.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'COMPLETED' });

  assert.strictEqual(resInvalid.status, 400);
  assert.strictEqual(resInvalid.body.error.code, 'INVALID_STATUS_TRANSITION');

  // Valid: WAITING -> CALLED -> IN_PROGRESS -> COMPLETED
  const resCalled = await request(app)
    .patch(`/api/queue/${entry.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'CALLED' });
  assert.strictEqual(resCalled.status, 200);
  assert.strictEqual(resCalled.body.data.status, 'CALLED');

  const resProgress = await request(app)
    .patch(`/api/queue/${entry.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'IN_PROGRESS' });
  assert.strictEqual(resProgress.status, 200);
  assert.strictEqual(resProgress.body.data.status, 'IN_PROGRESS');

  const resCompleted = await request(app)
    .patch(`/api/queue/${entry.id}/status`)
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ status: 'COMPLETED' });
  assert.strictEqual(resCompleted.status, 200);
  assert.strictEqual(resCompleted.body.data.status, 'COMPLETED');
});

test('Step 8.3: POST /api/queue/:branchId/call-next priority ordering & concurrency test (10 runs in a loop with 2 concurrent staff)', async (t) => {
  const branch = await prisma.branch.create({
    data: { name: 'Priority Call Branch', address: '789 Call Rd', phone: '+1234567890', is_active: true }
  });

  const staff1 = await prisma.user.create({
    data: { email: `staff_call1_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff Call 1', role: 'STAFF' }
  });

  const staff2 = await prisma.user.create({
    data: { email: `staff_call2_${Date.now()}@queue.local`, password_hash: 'hash', name: 'Staff Call 2', role: 'STAFF' }
  });

  const token1 = generateToken(staff1);
  const token2 = generateToken(staff2);

  t.after(async () => {
    await prisma.queueEntry.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [staff1.id, staff2.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
  });

  // 1. Priority order verification: Emergency > Priority > Normal
  const now = Date.now();
  const normalEntry = await prisma.queueEntry.create({
    data: {
      branch_id: branch.id,
      customer_name: 'Normal Customer',
      priority: 'NORMAL',
      priority_rank: 1,
      queue_number: 1,
      status: 'WAITING',
      created_at: new Date(now - 3000) // arrived first
    }
  });

  const priorityEntry = await prisma.queueEntry.create({
    data: {
      branch_id: branch.id,
      customer_name: 'Priority Customer',
      priority: 'PRIORITY',
      priority_rank: 2,
      queue_number: 2,
      status: 'WAITING',
      created_at: new Date(now - 2000) // arrived second
    }
  });

  const emergencyEntry = await prisma.queueEntry.create({
    data: {
      branch_id: branch.id,
      customer_name: 'Emergency Customer',
      priority: 'EMERGENCY',
      priority_rank: 3,
      queue_number: 3,
      status: 'WAITING',
      created_at: new Date(now - 1000) // arrived last
    }
  });

  // First call-next MUST return EMERGENCY customer
  const call1 = await request(app)
    .post(`/api/queue/${branch.id}/call-next`)
    .set('Authorization', `Bearer ${token1}`);
  assert.strictEqual(call1.status, 200);
  assert.strictEqual(call1.body.data.id, emergencyEntry.id);

  // Second call-next MUST return PRIORITY customer
  const call2 = await request(app)
    .post(`/api/queue/${branch.id}/call-next`)
    .set('Authorization', `Bearer ${token2}`);
  assert.strictEqual(call2.status, 200);
  assert.strictEqual(call2.body.data.id, priorityEntry.id);

  // Third call-next MUST return NORMAL customer
  const call3 = await request(app)
    .post(`/api/queue/${branch.id}/call-next`)
    .set('Authorization', `Bearer ${token1}`);
  assert.strictEqual(call3.status, 200);
  assert.strictEqual(call3.body.data.id, normalEntry.id);

  // 2. Concurrency test: Fire 2 concurrent call-next requests across 10 iterations in a loop
  // Two staff MUST NEVER receive the same customer
  for (let i = 1; i <= 10; i++) {
    // Populate 2 waiting customers for this iteration
    const cA = await prisma.queueEntry.create({
      data: {
        branch_id: branch.id,
        customer_name: `Customer ${i}A`,
        priority: 'NORMAL',
        priority_rank: 1,
        queue_number: 10 + i * 2,
        status: 'WAITING'
      }
    });

    const cB = await prisma.queueEntry.create({
      data: {
        branch_id: branch.id,
        customer_name: `Customer ${i}B`,
        priority: 'NORMAL',
        priority_rank: 1,
        queue_number: 11 + i * 2,
        status: 'WAITING'
      }
    });

    const [staffRes1, staffRes2] = await Promise.all([
      request(app)
        .post(`/api/queue/${branch.id}/call-next`)
        .set('Authorization', `Bearer ${token1}`),
      request(app)
        .post(`/api/queue/${branch.id}/call-next`)
        .set('Authorization', `Bearer ${token2}`)
    ]);

    assert.strictEqual(staffRes1.status, 200);
    assert.strictEqual(staffRes2.status, 200);

    const id1 = staffRes1.body.data?.id;
    const id2 = staffRes2.body.data?.id;

    assert.ok(id1, `Iteration ${i}: Staff 1 received a customer`);
    assert.ok(id2, `Iteration ${i}: Staff 2 received a customer`);
    assert.notStrictEqual(
      id1,
      id2,
      `Iteration ${i}: Two staff received the SAME customer (${id1})!`
    );

    const receivedIds = [id1, id2].sort();
    const expectedIds = [cA.id, cB.id].sort();
    assert.deepStrictEqual(
      receivedIds,
      expectedIds,
      `Iteration ${i}: Staff did not receive expected customer pair`
    );
  }
});
