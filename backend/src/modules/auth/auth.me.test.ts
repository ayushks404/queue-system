import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

test('GET /api/auth/me returns only the logged-in caller own data', async () => {
  const emailA = 'user_a@example.com';
  const emailB = 'user_b@example.com';
  const hash = await bcrypt.hash('pass123', 10);

  // Setup user A and user B
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
  const userA = await prisma.user.create({
    data: { email: emailA, password_hash: hash, name: 'Alice Customer', phone: '1111', role: 'CUSTOMER' }
  });
  const userB = await prisma.user.create({
    data: { email: emailB, password_hash: hash, name: 'Bob Staff', phone: '2222', role: 'STAFF' }
  });

  const tokenA = jwt.sign({ id: userA.id, email: userA.email, role: userA.role }, JWT_SECRET, { expiresIn: '15m' });

  // Call GET /api/auth/me with User A's token
  const resA = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${tokenA}`);

  assert.strictEqual(resA.status, 200, 'Expected 200 OK');
  assert.strictEqual(resA.body.success, true);
  assert.strictEqual(resA.body.data.id, userA.id, 'Must return User A id');
  assert.strictEqual(resA.body.data.email, emailA, 'Must return User A email');
  assert.strictEqual(resA.body.data.name, 'Alice Customer', 'Must return User A name');
  assert.notStrictEqual(resA.body.data.email, emailB, 'Must NOT return User B email');
  assert.notStrictEqual(resA.body.data.name, 'Bob Staff', 'Must NOT return User B data');

  // Clean up
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
});
