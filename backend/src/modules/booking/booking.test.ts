import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import { sweepExpiredReservations, closeReservationExpiryQueue } from '../../queues/reservationExpiry.queue';
import { redis } from '../../lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars';

function generateToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Step 5.1: POST /api/reservations creates a 5-min hold, second sequential request returns SLOT_UNAVAILABLE', async (t) => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Res Test Branch 1',
      address: '101 Hold Way',
      phone: '+1234567891',
      is_active: true
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'Standard Hold Service',
      duration_minutes: 30,
      price: 40.0,
      capacity: 1,
      is_active: true
    }
  });

  const user1 = await prisma.user.create({
    data: {
      email: `res_user_1_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Res User 1',
      role: 'CUSTOMER'
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: `res_user_2_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Res User 2',
      role: 'CUSTOMER'
    }
  });

  const token1 = generateToken(user1);
  const token2 = generateToken(user2);

  const slotDate = '2026-09-20';
  const slotTime = '10:00';

  t.after(async () => {
    await prisma.reservation.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // 1. User 1 reserves the slot -> 201 Created
  const res1 = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token1}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      slotDate,
      slotTime
    });

  assert.strictEqual(res1.status, 201);
  assert.strictEqual(res1.body.success, true);
  assert.ok(res1.body.data.id);
  assert.ok(new Date(res1.body.data.expires_at).getTime() > Date.now());

  // 2. User 2 tries to reserve the identical slot -> 409 SLOT_UNAVAILABLE
  const res2 = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      slotDate,
      slotTime
    });

  assert.strictEqual(res2.status, 409);
  assert.strictEqual(res2.body.success, false);
  assert.strictEqual(res2.body.error.code, 'SLOT_UNAVAILABLE');
});

test('Step 5.2: Concurrency test — two concurrent requests for identical slot result in exactly 1 success and 1 SLOT_UNAVAILABLE (10 runs in a loop)', async (t) => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Concurrency Branch',
      address: '789 Race St',
      phone: '+1234567892',
      is_active: true
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'Concurrent Service',
      duration_minutes: 30,
      price: 50.0,
      capacity: 1,
      is_active: true
    }
  });

  const userA = await prisma.user.create({
    data: {
      email: `conc_a_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Concurrent User A',
      role: 'CUSTOMER'
    }
  });

  const userB = await prisma.user.create({
    data: {
      email: `conc_b_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Concurrent User B',
      role: 'CUSTOMER'
    }
  });

  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);

  t.after(async () => {
    await prisma.reservation.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // Run at least 10 iterations per requirements
  for (let i = 1; i <= 10; i++) {
    const slotTime = `1${i % 10}:00`;
    const slotDate = '2026-09-22';

    const [reqA, reqB] = await Promise.all([
      request(app)
        .post('/api/reservations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: branch.id,
          serviceId: service.id,
          slotDate,
          slotTime
        }),
      request(app)
        .post('/api/reservations')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          branchId: branch.id,
          serviceId: service.id,
          slotDate,
          slotTime
        })
    ]);

    const statuses = [reqA.status, reqB.status].sort();
    assert.deepStrictEqual(
      statuses,
      [201, 409],
      `Run ${i}: Expected exactly one 201 and one 409, got [${reqA.status}, ${reqB.status}]`
    );

    const errorCodes = [reqA.body?.error?.code, reqB.body?.error?.code].filter(Boolean);
    assert.deepStrictEqual(
      errorCodes,
      ['SLOT_UNAVAILABLE'],
      `Run ${i}: Expected failure code SLOT_UNAVAILABLE`
    );
  }
});

test('Step 5.3 & 5.4: POST /api/appointments confirms reservation atomically, validates ownership/expiry, writes audit log, and handles Idempotency-Key', async (t) => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Booking Test Branch',
      address: '222 Book Ave',
      phone: '+1234567893',
      is_active: true
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'Full Consultation',
      duration_minutes: 45,
      price: 75.0,
      capacity: 1,
      is_active: true
    }
  });

  const owner = await prisma.user.create({
    data: {
      email: `owner_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Owner User',
      role: 'CUSTOMER'
    }
  });

  const attacker = await prisma.user.create({
    data: {
      email: `attacker_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Attacker User',
      role: 'CUSTOMER'
    }
  });

  const ownerToken = generateToken(owner);
  const attackerToken = generateToken(attacker);

  t.after(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.reservation.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, attacker.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // 1. Create a valid reservation for owner
  const resHold = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      slotDate: '2026-09-25',
      slotTime: '11:00'
    });
  assert.strictEqual(resHold.status, 201);
  const reservationId = resHold.body.data.id;

  // 2. Attacker tries to confirm owner's reservation -> 403 FORBIDDEN
  const resForeign = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${attackerToken}`)
    .send({ reservationId });
  assert.strictEqual(resForeign.status, 403);
  assert.strictEqual(resForeign.body.error.code, 'FORBIDDEN');

  // 3. Owner confirms with Idempotency-Key -> 201 Created
  const idempotencyKey = `idem-${Date.now()}-abc`;
  const resConfirm1 = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${ownerToken}`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ reservationId });

  assert.strictEqual(resConfirm1.status, 201);
  assert.strictEqual(resConfirm1.body.success, true);
  assert.ok(resConfirm1.body.data.id);
  assert.ok(resConfirm1.body.data.appointment_number.startsWith('APT-2026-'));
  assert.strictEqual(resConfirm1.body.data.status, 'CONFIRMED');
  assert.strictEqual(resConfirm1.body.data.start_time, '11:00');
  assert.strictEqual(resConfirm1.body.data.end_time, '11:45');

  // Verify reservation was deleted and audit log created
  const reservationInDb = await prisma.reservation.findUnique({ where: { id: reservationId } });
  assert.strictEqual(reservationInDb, null, 'Reservation must be deleted after confirmation');

  const auditLog = await prisma.auditLog.findFirst({
    where: { appointment_id: resConfirm1.body.data.id }
  });
  assert.ok(auditLog, 'Audit log must be created');
  assert.strictEqual(auditLog?.action, 'APPOINTMENT_CONFIRMED');
  assert.strictEqual(auditLog?.new_status, 'CONFIRMED');

  // 4. Step 5.4: Repeat identical request with same Idempotency-Key -> returns same appointment, exactly 1 row in DB
  const resConfirm2 = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${ownerToken}`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ reservationId });

  assert.strictEqual(resConfirm2.status, 200);
  assert.strictEqual(resConfirm2.body.data.id, resConfirm1.body.data.id);

  const appointmentCount = await prisma.appointment.count({
    where: { idempotency_key: idempotencyKey }
  });
  assert.strictEqual(appointmentCount, 1, 'Exactly one appointment row must exist');

  // 5. Test expired reservation rejection
  const expiredRes = await prisma.reservation.create({
    data: {
      user_id: owner.id,
      branch_id: branch.id,
      service_id: service.id,
      slot_date: new Date('2026-09-25T00:00:00.000Z'),
      slot_time: '14:00',
      expires_at: new Date(Date.now() - 1000) // in the past
    }
  });

  const resExpiredConfirm = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ reservationId: expiredRes.id });

  assert.strictEqual(resExpiredConfirm.status, 400);
  assert.strictEqual(resExpiredConfirm.body.error.code, 'RESERVATION_EXPIRED');
});

test('Step 5.5: Expiring unclaimed reservations deletes past reservations and frees the slot', async (t) => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Expiry Branch',
      address: '333 Past St',
      phone: '+1234567894',
      is_active: true
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'Expiry Service',
      duration_minutes: 30,
      price: 30.0,
      capacity: 1,
      is_active: true
    }
  });

  const user1 = await prisma.user.create({
    data: {
      email: `exp_user_1_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Exp User 1',
      role: 'CUSTOMER'
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: `exp_user_2_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Exp User 2',
      role: 'CUSTOMER'
    }
  });

  const token2 = generateToken(user2);
  const targetDateStr = '2026-09-28';
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  t.after(async () => {
    await prisma.reservation.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
  });

  // Create an expired reservation
  const expiredRes = await prisma.reservation.create({
    data: {
      user_id: user1.id,
      branch_id: branch.id,
      service_id: service.id,
      slot_date: targetDate,
      slot_time: '15:00',
      expires_at: new Date(Date.now() - 5000)
    }
  });

  // Run expiry sweep
  const sweptCount = await sweepExpiredReservations();
  assert.ok(sweptCount >= 1, 'At least 1 reservation must be swept');

  const checkDb = await prisma.reservation.findUnique({ where: { id: expiredRes.id } });
  assert.strictEqual(checkDb, null, 'Expired reservation must be removed');

  // Now user2 can reserve that exact slot
  const resRebook = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      branchId: branch.id,
      serviceId: service.id,
      slotDate: targetDateStr,
      slotTime: '15:00'
    });

  assert.strictEqual(resRebook.status, 201, 'Slot must become immediately bookable again');
  assert.strictEqual(resRebook.body.success, true);
  await closeReservationExpiryQueue();
  await redis.quit();
});
