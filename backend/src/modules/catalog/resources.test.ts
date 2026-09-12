import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('Admin CRUD resources and service_resources linking persists correctly', async () => {
  const adminToken = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000001', email: 'admin@queue.local', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  // 1. Create Branch and Service
  const branch = await prisma.branch.create({
    data: { name: 'Resource Test Branch', address: '123 Test St', phone: '123' }
  });

  const service = await prisma.service.create({
    data: { name: 'MRI Scan', duration_minutes: 45, price: 500.00, capacity: 1 }
  });

  // 2. Create resource in branch
  const createResRes = await request(app)
    .post(`/api/branches/${branch.id}/resources`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'MRI Scanner 1', type: 'EQUIPMENT' });

  assert.strictEqual(createResRes.status, 201);
  const resourceId = createResRes.body.data.id;
  assert.ok(resourceId);
  assert.strictEqual(createResRes.body.data.type, 'EQUIPMENT');

  // 3. Link required resource types to service
  const linkRes = await request(app)
    .post(`/api/services/${service.id}/resources`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ resource_types: ['EQUIPMENT', 'OPERATOR_ROOM'] });

  assert.strictEqual(linkRes.status, 201);
  assert.strictEqual(linkRes.body.data.length, 2);

  // 4. Query service resources -> confirm link persisted correctly
  const getLinkedRes = await request(app)
    .get(`/api/services/${service.id}/resources`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(getLinkedRes.status, 200);
  assert.strictEqual(getLinkedRes.body.data.length, 2);
  const types = getLinkedRes.body.data.map((r: any) => r.resource_type);
  assert.ok(types.includes('EQUIPMENT'), 'Must contain EQUIPMENT');
  assert.ok(types.includes('OPERATOR_ROOM'), 'Must contain OPERATOR_ROOM');

  // Clean up
  await prisma.service.delete({ where: { id: service.id } });
  await prisma.branch.delete({ where: { id: branch.id } });
});
