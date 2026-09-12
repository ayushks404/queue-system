import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('Admin CRUD business_hours and holidays are scoped correctly per branch', async () => {
  const adminToken = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000001', email: 'admin@queue.local', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  // 1. Create Branch A and Branch B
  const branchA = await prisma.branch.create({
    data: { name: 'Branch A', address: '123 A St', phone: '111' }
  });
  const branchB = await prisma.branch.create({
    data: { name: 'Branch B', address: '456 B St', phone: '222' }
  });

  // 2. Set business hours for Branch A only
  const hoursA = [
    { day_of_week: 1, open_time: '09:00:00', close_time: '17:00:00', break_start: '12:00:00', break_end: '13:00:00' },
    { day_of_week: 2, open_time: '09:00:00', close_time: '17:00:00' }
  ];

  const setHoursRes = await request(app)
    .post(`/api/branches/${branchA.id}/business-hours`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ hours: hoursA });

  assert.strictEqual(setHoursRes.status, 200);
  assert.strictEqual(setHoursRes.body.data.length, 2);

  // 3. Create holiday for Branch A only
  const createHolRes = await request(app)
    .post(`/api/branches/${branchA.id}/holidays`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ holiday_date: '2026-12-25', reason: 'Christmas' });

  assert.strictEqual(createHolRes.status, 201);
  const holidayAId = createHolRes.body.data.id;

  // 4. Query business hours for Branch B -> MUST be empty (proves scoping)
  const getHoursBRes = await request(app)
    .get(`/api/branches/${branchB.id}/business-hours`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getHoursBRes.status, 200);
  assert.strictEqual(getHoursBRes.body.data.length, 0, 'Branch B must have no business hours');

  // 5. Query holidays for Branch B -> MUST be empty (proves scoping)
  const getHolBRes = await request(app)
    .get(`/api/branches/${branchB.id}/holidays`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getHolBRes.status, 200);
  assert.strictEqual(getHolBRes.body.data.length, 0, 'Branch B must have no holidays');

  // 6. Query Branch A business hours & holidays -> MUST contain Branch A records
  const getHoursARes = await request(app)
    .get(`/api/branches/${branchA.id}/business-hours`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getHoursARes.status, 200);
  assert.strictEqual(getHoursARes.body.data.length, 2);

  const getHolARes = await request(app)
    .get(`/api/branches/${branchA.id}/holidays`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getHolARes.status, 200);
  assert.strictEqual(getHolARes.body.data.length, 1);
  assert.strictEqual(getHolARes.body.data[0].id, holidayAId);

  // Clean up
  await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } });
});
