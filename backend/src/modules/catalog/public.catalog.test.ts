import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../lib/prisma';

test('Public GET /api/branches and GET /api/services require no auth and exclude inactive records', async () => {
  // 1. Setup Active and Inactive Branches
  const activeBranch = await prisma.branch.create({
    data: { name: 'Active Branch', address: '123 Live St', phone: '111', is_active: true }
  });
  const inactiveBranch = await prisma.branch.create({
    data: { name: 'Closed Branch', address: '456 Dead St', phone: '222', is_active: false }
  });

  // 2. Setup Active and Inactive Services
  const activeService = await prisma.service.create({
    data: { name: 'Active Dental Checkup', duration_minutes: 30, price: 50.00, capacity: 1, is_active: true }
  });
  const inactiveService = await prisma.service.create({
    data: { name: 'Deprecated Surgery', duration_minutes: 60, price: 200.00, capacity: 1, is_active: false }
  });

  // 3. Public GET /api/branches without auth header
  const branchRes = await request(app)
    .get('/api/branches');

  assert.strictEqual(branchRes.status, 200, 'Public branches endpoint must return 200 without auth');
  assert.strictEqual(branchRes.body.success, true);
  const branchIds = branchRes.body.data.map((b: any) => b.id);
  assert.ok(branchIds.includes(activeBranch.id), 'Active branch must be included in public list');
  assert.strictEqual(branchIds.includes(inactiveBranch.id), false, 'Inactive branch must be EXCLUDED');

  // 4. Public GET /api/services without auth header
  const serviceRes = await request(app)
    .get('/api/services');

  assert.strictEqual(serviceRes.status, 200, 'Public services endpoint must return 200 without auth');
  assert.strictEqual(serviceRes.body.success, true);
  const serviceIds = serviceRes.body.data.map((s: any) => s.id);
  assert.ok(serviceIds.includes(activeService.id), 'Active service must be included in public list');
  assert.strictEqual(serviceIds.includes(inactiveService.id), false, 'Inactive service must be EXCLUDED');

  // Clean up
  await prisma.service.deleteMany({ where: { id: { in: [activeService.id, inactiveService.id] } } });
  await prisma.branch.deleteMany({ where: { id: { in: [activeBranch.id, inactiveBranch.id] } } });
});
