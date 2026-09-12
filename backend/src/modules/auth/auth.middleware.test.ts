import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('JWT auth middleware protects routes and attaches req.user', async () => {
  const email = 'middleware_test@example.com';
  const hash = await bcrypt.hash('pass123', 10);
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: { email, password_hash: hash, name: 'Middleware User', role: 'CUSTOMER' }
  });

  // Test 1: No token returns 401
  const noTokenRes = await request(app)
    .get('/api/auth/me');

  assert.strictEqual(noTokenRes.status, 401, 'No token must return 401');
  assert.strictEqual(noTokenRes.body.success, false);
  assert.strictEqual(noTokenRes.body.error.code, 'UNAUTHORIZED');

  // Test 2: Invalid token returns 401
  const invalidTokenRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer invalid_garbage_token_123');

  assert.strictEqual(invalidTokenRes.status, 401, 'Invalid token must return 401');
  assert.strictEqual(invalidTokenRes.body.success, false);

  // Test 3: Valid token returns 200 with user payload
  const validToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const validRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${validToken}`);

  assert.strictEqual(validRes.status, 200, 'Valid token must return 200');
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.data.email, email);
  assert.strictEqual(validRes.body.data.role, 'CUSTOMER');

  // Clean up
  await prisma.user.delete({ where: { email } });
});
