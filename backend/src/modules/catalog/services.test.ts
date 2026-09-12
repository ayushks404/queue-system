import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('Admin CRUD for /api/services supports full lifecycle', async () => {
  const adminToken = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000001', email: 'admin@queue.local', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  // 1. CREATE Service
  const createRes = await request(app)
    .post('/api/services')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'General Consultation',
      duration_minutes: 30,
      price: 75.50,
      capacity: 2
    });

  assert.strictEqual(createRes.status, 201, 'Create service must return 201');
  assert.strictEqual(createRes.body.success, true);
  const serviceId = createRes.body.data.id;
  assert.ok(serviceId);
  assert.strictEqual(createRes.body.data.name, 'General Consultation');
  assert.strictEqual(createRes.body.data.duration_minutes, 30);
  assert.strictEqual(Number(createRes.body.data.price), 75.50);

  // 2. READ all services (admin)
  const listRes = await request(app)
    .get('/api/services/admin')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.data));
  const found = listRes.body.data.find((s: any) => s.id === serviceId);
  assert.ok(found, 'Created service must be present in service list');

  // 3. READ single service
  const getSingleRes = await request(app)
    .get(`/api/services/${serviceId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getSingleRes.status, 200);
  assert.strictEqual(getSingleRes.body.data.id, serviceId);

  // 4. UPDATE service
  const updateRes = await request(app)
    .patch(`/api/services/${serviceId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Specialist Consultation',
      price: 120.00
    });

  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.data.name, 'Specialist Consultation');
  assert.strictEqual(Number(updateRes.body.data.price), 120.00);

  // 5. DELETE service
  const deleteRes = await request(app)
    .delete(`/api/services/${serviceId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.body.success, true);

  // 6. Confirm deleted service returns 404
  const getDeletedRes = await request(app)
    .get(`/api/services/${serviceId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getDeletedRes.status, 404, 'Deleted service must return 404');
});
