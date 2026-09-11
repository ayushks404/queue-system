import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import { prisma } from '../../lib/prisma';

test('POST /api/auth/register hashes password and assigns CUSTOMER role', async () => {
  const email = 'register_test@example.com';
  const plainPassword = 'my_secret_password_999';

  // Clean up if exists
  await prisma.user.deleteMany({ where: { email } });

  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: plainPassword,
      name: 'Register Test User',
      phone: '1234567890'
    });

  assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}`);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.email, email);
  assert.strictEqual(res.body.data.role, 'CUSTOMER');
  assert.strictEqual(res.body.data.password_hash, undefined, 'Response should not expose password hash');

  // Query database directly to confirm password is stored hashed, NOT plaintext
  const storedUser = await prisma.user.findUnique({ where: { email } });
  assert.ok(storedUser, 'User must exist in DB');
  assert.notStrictEqual(storedUser.password_hash, plainPassword, 'Password must NOT be plaintext');

  const isHashValid = await bcrypt.compare(plainPassword, storedUser.password_hash);
  assert.strictEqual(isHashValid, true, 'Stored hash must verify against plain password');

  // Clean up
  await prisma.user.delete({ where: { email } });
});
