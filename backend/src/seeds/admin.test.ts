import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { seedAdmin } from './admin';

test('admin seed script creates admin user with valid credentials and role ADMIN', async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@queue.local';
  const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';

  await seedAdmin();

  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user, 'Admin user should exist in database');
  assert.strictEqual(user.role, 'ADMIN', 'Admin user role must be ADMIN');

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  assert.strictEqual(passwordValid, true, 'Admin password hash must match password');
});
