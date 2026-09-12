import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { closeWaitlistQueue } from '../../queues/waitlist.queue';
import { closeReservationExpiryQueue } from '../../queues/reservationExpiry.queue';
import { closeIO } from '../../realtime/socket';

test('Phase 12 — Reports & Analytics API', async (t) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key_queue_system_2026';

  // Create mock admin and test records
  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Reports User',
      email: `admin-reports-${Date.now()}@queue.local`,
      password_hash: 'hash',
      role: 'ADMIN',
    },
  });

  const customerUser = await prisma.user.create({
    data: {
      name: 'Customer Reports User',
      email: `customer-reports-${Date.now()}@queue.local`,
      password_hash: 'hash',
      role: 'CUSTOMER',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      name: `Report Branch ${Date.now()}`,
      address: '123 Test St',
      phone: '+15550199',
      is_active: true,
    },
  });

  const service = await prisma.service.create({
    data: {
      name: `Report Service ${Date.now()}`,
      duration_minutes: 30,
      price: 50.0,
      capacity: 1,
      is_active: true,
    },
  });

  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const customerToken = jwt.sign(
    { id: customerUser.id, email: customerUser.email, role: customerUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  t.after(async () => {
    await prisma.appointment.deleteMany({ where: { branch_id: branch.id } });
    await prisma.queueEntry.deleteMany({ where: { branch_id: branch.id } });
    await prisma.service.delete({ where: { id: service.id } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: customerUser.id } }).catch(() => {});
    await closeWaitlistQueue();
    await closeReservationExpiryQueue();
    await closeIO();
  });

  await t.test('12.1 Non-admin/staff gets 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${customerToken}`);

    assert.equal(res.status, 403);
  });

  await t.test('12.2 Admin fetches summary matching SQL aggregates accurately', async () => {
    const today = new Date('2026-09-11');

    // Seed 1 COMPLETED, 1 CANCELLED, 1 NO_SHOW appointment
    await prisma.appointment.create({
      data: {
        appointment_number: `RPT-C-${Date.now()}`,
        user_id: customerUser.id,
        branch_id: branch.id,
        service_id: service.id,
        appointment_date: today,
        start_time: '09:00',
        end_time: '09:30',
        status: 'COMPLETED',
      },
    });

    await prisma.appointment.create({
      data: {
        appointment_number: `RPT-X-${Date.now()}`,
        user_id: customerUser.id,
        branch_id: branch.id,
        service_id: service.id,
        appointment_date: today,
        start_time: '09:30',
        end_time: '10:00',
        status: 'CANCELLED',
      },
    });

    await prisma.appointment.create({
      data: {
        appointment_number: `RPT-N-${Date.now()}`,
        user_id: customerUser.id,
        branch_id: branch.id,
        service_id: service.id,
        appointment_date: today,
        start_time: '10:00',
        end_time: '10:30',
        status: 'NO_SHOW',
      },
    });

    // Seed queue entry
    await prisma.queueEntry.create({
      data: {
        branch_id: branch.id,
        customer_name: 'Queue Cust 1',
        queue_number: 1,
        priority: 'NORMAL',
        status: 'COMPLETED',
      },
    });

    const res = await request(app)
      .get(`/api/reports/summary?branchId=${branch.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.summary);
    const { summary } = res.body;

    assert.equal(summary.total_bookings, 3);
    assert.equal(summary.completed, 1);
    assert.equal(summary.cancelled, 1);
    assert.equal(summary.no_shows, 1);
    assert.equal(summary.total_queue_entries, 1);
  });
});
