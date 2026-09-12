import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { closeWaitlistQueue } from '../../queues/waitlist.queue';
import { closeReservationExpiryQueue } from '../../queues/reservationExpiry.queue';
import { closeIO } from '../../realtime/socket';

test('Phase 13 — Security & Hardening Suite', async (t) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

  // Seed two users for IDOR testing
  const userA = await prisma.user.create({
    data: {
      name: 'User A',
      email: `usera-${Date.now()}@test.local`,
      password_hash: 'hash',
      role: 'CUSTOMER',
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: 'User B',
      email: `userb-${Date.now()}@test.local`,
      password_hash: 'hash',
      role: 'CUSTOMER',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      name: `Security Branch ${Date.now()}`,
      address: '100 Security Blvd',
      phone: '+15559999',
      is_active: true,
    },
  });

  const service = await prisma.service.create({
    data: {
      name: `Security Service ${Date.now()}`,
      duration_minutes: 30,
      price: 100,
      capacity: 1,
      is_active: true,
    },
  });

  const tokenA = jwt.sign(
    { id: userA.id, email: userA.email, role: userA.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const tokenB = jwt.sign(
    { id: userB.id, email: userB.email, role: userB.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  t.after(async () => {
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
    await closeWaitlistQueue();
    await closeReservationExpiryQueue();
    await closeIO();
  });

  await t.test('13.1 Zod validation on POST/PATCH returns 400 VALIDATION_ERROR for malformed payloads', async () => {
    // Malformed register payload (invalid email and short password)
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email-string',
        password: '123',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
  });

  await t.test('13.3 IDOR: User B cannot cancel User A appointment', async () => {
    // Create appointment owned by User A
    const apptA = await prisma.appointment.create({
      data: {
        appointment_number: `SEC-A-${Date.now()}`,
        user_id: userA.id,
        branch_id: branch.id,
        service_id: service.id,
        appointment_date: new Date('2026-09-20'),
        start_time: '11:00',
        end_time: '11:30',
        status: 'CONFIRMED',
      },
    });

    // User B tries to cancel User A's appointment
    const res = await request(app)
      .patch(`/api/appointments/${apptA.id}/cancel`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ reason: 'Malicious cancellation' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');

    // Verify appointment remains untouched
    const freshAppt = await prisma.appointment.findUnique({ where: { id: apptA.id } });
    assert.equal(freshAppt?.status, 'CONFIRMED');
  });

  await t.test('13.4 CORS restricted from arbitrary external origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://malicious-attacker-site.xyz');

    // Express cors rejects disallowed origins
    assert.ok(res.status === 500 || res.status === 403 || !res.headers['access-control-allow-origin']);
  });
});
