import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import bcrypt from 'bcryptjs';

test('POST /api/auth/refresh and POST /api/auth/logout handle token lifecycle and revocation', async () => {
  const email = 'refresh_test@example.com';
  const password = 'pass_refresh_123';

  // Setup test user
  await prisma.user.deleteMany({ where: { email } });
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, password_hash: hash, name: 'Refresh Test User', role: 'CUSTOMER' }
  });

  // 1. Login to obtain tokens
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  assert.strictEqual(loginRes.status, 200);
  const { refreshToken } = loginRes.body.data;
  assert.ok(refreshToken, 'Refresh token must be present');

  // 2. Test refresh: Should issue a new valid accessToken
  const refreshRes = await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken });

  assert.strictEqual(refreshRes.status, 200, 'Refresh must return 200');
  assert.strictEqual(refreshRes.body.success, true);
  assert.ok(refreshRes.body.data.accessToken, 'New accessToken must be returned');

  // 3. Test logout: Invalidate the refresh token
  const logoutRes = await request(app)
    .post('/api/auth/logout')
    .send({ refreshToken });

  assert.strictEqual(logoutRes.status, 200, 'Logout must return 200');
  assert.strictEqual(logoutRes.body.success, true);

  // 4. Test reuse of logged-out refresh token: MUST be rejected with 401
  const reuseRes = await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken });

  assert.strictEqual(reuseRes.status, 401, 'Logged-out refresh token must be rejected with 401');
  assert.strictEqual(reuseRes.body.success, false);
  assert.strictEqual(reuseRes.body.error.code, 'UNAUTHORIZED');

  // Clean up
  await prisma.user.delete({ where: { email } });
  await redis.quit();
});
