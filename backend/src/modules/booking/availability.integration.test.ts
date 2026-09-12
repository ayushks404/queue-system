import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import app from '../../index';
import { invalidateAvailabilityCache } from './availability.controller';

test('Step 4.4 & 4.5: GET /api/availability queries Postgres, caches in Redis, and handles cache invalidation', async (t) => {
  // Create test branch, business hours (Tuesday), service, and a booked appointment
  const branch = await prisma.branch.create({
    data: {
      name: 'Availability Test Branch',
      address: '456 Avail Ave',
      phone: '+1234567890',
      is_active: true,
      business_hours: {
        create: [
          {
            day_of_week: 2, // Tuesday
            open_time: '09:00',
            close_time: '12:00',
            break_start: null,
            break_end: null
          }
        ]
      }
    }
  });

  const service = await prisma.service.create({
    data: {
      name: 'General Consultation',
      duration_minutes: 30,
      price: 50.0,
      capacity: 1,
      is_active: true
    }
  });

  const user = await prisma.user.create({
    data: {
      email: `avail_cust_${Date.now()}@queue.local`,
      password_hash: 'hashedpassword',
      name: 'Avail Customer',
      role: 'CUSTOMER'
    }
  });

  const targetDateStr = '2026-09-15'; // Tuesday
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  // Book 09:00 slot
  await prisma.appointment.create({
    data: {
      appointment_number: `APT-${Date.now()}-000001`,
      user_id: user.id,
      branch_id: branch.id,
      service_id: service.id,
      appointment_date: targetDate,
      start_time: '09:00',
      end_time: '09:30',
      status: 'CONFIRMED'
    }
  });

  // Ensure Redis is clean for this test
  await invalidateAvailabilityCache(branch.id, service.id, targetDateStr);

  t.after(async () => {
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.businessHour.deleteMany({ where: { branch_id: branch.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await redis.del(`avail:${branch.id}:${service.id}:${targetDateStr}`);
    await redis.quit();
  });

  // 1. First Request: Cache MISS -> computes from DB (09:00 booked, so 09:30, 10:00, 10:30, 11:00, 11:30 available)
  const res1 = await request(app)
    .get(`/api/availability?branchId=${branch.id}&serviceId=${service.id}&date=${targetDateStr}`);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.success, true);
  assert.strictEqual(res1.body.data.branch_id, branch.id);
  assert.strictEqual(res1.body.data.service_id, service.id);
  assert.strictEqual(res1.body.data.date, targetDateStr);
  assert.deepStrictEqual(res1.body.data.available_slots, ['09:30', '10:00', '10:30', '11:00', '11:30']);
  assert.strictEqual(res1.body.from_cache, undefined);

  // 2. Second Request: Cache HIT from Redis within 30s
  const res2 = await request(app)
    .get(`/api/availability?branchId=${branch.id}&serviceId=${service.id}&date=${targetDateStr}`);

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.success, true);
  assert.strictEqual(res2.body.from_cache, true);
  assert.deepStrictEqual(res2.body.data.available_slots, ['09:30', '10:00', '10:30', '11:00', '11:30']);

  // 3. Cache Invalidation
  await invalidateAvailabilityCache(branch.id, service.id, targetDateStr);

  // 4. Third Request: Cache MISS again after invalidation
  const res3 = await request(app)
    .get(`/api/availability?branchId=${branch.id}&serviceId=${service.id}&date=${targetDateStr}`);

  assert.strictEqual(res3.status, 200);
  assert.strictEqual(res3.body.success, true);
  assert.strictEqual(res3.body.from_cache, undefined);
  assert.deepStrictEqual(res3.body.data.available_slots, ['09:30', '10:00', '10:30', '11:00', '11:30']);
});
