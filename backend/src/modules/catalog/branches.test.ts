import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

test('Admin CRUD /api/branches works for seeded admin and blocks non-admin with 403', async () => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@queue.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const customerEmail = 'throwaway_customer@test.com';

  // 1. Ensure throwaway customer exists
  await prisma.user.deleteMany({ where: { email: customerEmail } });
  const hash = await bcrypt.hash('pass123', 10);
  await prisma.user.create({
    data: { email: customerEmail, password_hash: hash, name: 'Throwaway Customer', role: 'CUSTOMER' }
  });

  // 2. Login as seeded admin
  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: adminPassword });

  assert.strictEqual(adminLoginRes.status, 200);
  const adminToken = adminLoginRes.body.data.accessToken;

  // 3. Login as throwaway customer
  const custLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: customerEmail, password: 'pass123' });

  assert.strictEqual(custLoginRes.status, 200);
  const custToken = custLoginRes.body.data.accessToken;

  // 4. Non-admin POST /api/branches -> MUST return 403
  const forbiddenPostRes = await request(app)
    .post('/api/branches')
    .set('Authorization', `Bearer ${custToken}`)
    .send({ name: 'Hacked Branch', address: '123 Fake St', phone: '000-0000' });

  assert.strictEqual(forbiddenPostRes.status, 403, 'Non-admin must receive 403 on POST /api/branches');
  assert.strictEqual(forbiddenPostRes.body.error.code, 'FORBIDDEN');

  // 5. Admin POST /api/branches -> MUST return 201
  const createRes = await request(app)
    .post('/api/branches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Downtown Branch', address: '100 Main St', phone: '555-0100' });

  assert.strictEqual(createRes.status, 201, 'Admin must receive 201 Created on POST /api/branches');
  assert.strictEqual(createRes.body.success, true);
  const branchId = createRes.body.data.id;
  assert.ok(branchId);
  assert.strictEqual(createRes.body.data.name, 'Downtown Branch');

  // 6. Admin GET /api/branches/admin -> MUST return 200
  const listRes = await request(app)
    .get('/api/branches/admin')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.data));
  const found = listRes.body.data.find((b: any) => b.id === branchId);
  assert.ok(found, 'Created branch must be in admin branch list');

  // 7. Admin PATCH /api/branches/:id -> MUST return 200
  const patchRes = await request(app)
    .patch(`/api/branches/${branchId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Downtown Super Branch', is_active: true });

  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.data.name, 'Downtown Super Branch');

  // 8. Non-admin PATCH /api/branches/:id -> MUST return 403
  const forbiddenPatchRes = await request(app)
    .patch(`/api/branches/${branchId}`)
    .set('Authorization', `Bearer ${custToken}`)
    .send({ name: 'Customer Attempted Change' });

  assert.strictEqual(forbiddenPatchRes.status, 403, 'Non-admin must receive 403 on PATCH /api/branches/:id');

  // Clean up
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.user.delete({ where: { email: customerEmail } });
});
