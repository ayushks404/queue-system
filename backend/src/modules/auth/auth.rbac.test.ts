import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('requireRole RBAC middleware blocks unauthorized roles with 403', async () => {
  const customerToken = jwt.sign(
    { id: '11111111-1111-1111-1111-111111111111', email: 'cust@test.com', role: 'CUSTOMER' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const adminToken = jwt.sign(
    { id: '22222222-2222-2222-2222-222222222222', email: 'admin@test.com', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Test 1: Customer role on admin route -> 403 Forbidden
  const forbiddenRes = await request(app)
    .get('/api/auth/admin-only')
    .set('Authorization', `Bearer ${customerToken}`);

  assert.strictEqual(forbiddenRes.status, 403, 'Customer role must get 403 on admin-only route');
  assert.strictEqual(forbiddenRes.body.success, false);
  assert.strictEqual(forbiddenRes.body.error.code, 'FORBIDDEN');

  // Test 2: Admin role on admin route -> 200 OK
  const allowedRes = await request(app)
    .get('/api/auth/admin-only')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.strictEqual(allowedRes.status, 200, 'Admin role must get 200 on admin-only route');
  assert.strictEqual(allowedRes.body.success, true);
  assert.strictEqual(allowedRes.body.data.message, 'admin access granted');
});
