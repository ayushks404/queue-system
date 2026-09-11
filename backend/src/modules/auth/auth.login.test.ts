import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('POST /api/auth/login validates credentials and issues JWT tokens', async () => {
  const email = 'login_test@example.com';
  const password = 'correct_password_123';
  const wrongPassword = 'wrong_password_456';

  // Setup test user
  await prisma.user.deleteMany({ where: { email } });
  const password_hash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      password_hash,
      name: 'Login Test User',
      role: 'CUSTOMER'
    }
  });

  // Test 1: Wrong password returns 401
  const wrongPassRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: wrongPassword });

  assert.strictEqual(wrongPassRes.status, 401, 'Wrong password must return 401');
  assert.strictEqual(wrongPassRes.body.success, false);
  assert.strictEqual(wrongPassRes.body.error.code, 'UNAUTHORIZED');

  // Test 2: Non-existent email returns 401
  const nonExistentRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nonexistent@example.com', password });

  assert.strictEqual(nonExistentRes.status, 401, 'Non-existent email must return 401');
  assert.strictEqual(nonExistentRes.body.success, false);

  // Test 3: Correct credentials return tokens
  const correctRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  assert.strictEqual(correctRes.status, 200, 'Correct credentials must return 200');
  assert.strictEqual(correctRes.body.success, true);
  assert.ok(correctRes.body.data.accessToken, 'Must return accessToken');
  assert.ok(correctRes.body.data.refreshToken, 'Must return refreshToken');
  assert.strictEqual(correctRes.body.data.user.email, email);

  // Verify access token
  const decoded = jwt.verify(correctRes.body.data.accessToken, JWT_SECRET) as any;
  assert.strictEqual(decoded.email, email);
  assert.strictEqual(decoded.role, 'CUSTOMER');

  // Clean up
  await prisma.user.delete({ where: { email } });
});
