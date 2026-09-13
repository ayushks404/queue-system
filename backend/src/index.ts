import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import adminUserRoutes from './modules/admin/users.routes';
import branchRoutes from './modules/catalog/branches.routes';
import serviceRoutes from './modules/catalog/services.routes';
import resourceRoutes from './modules/catalog/resources.routes';
import availabilityRoutes from './modules/booking/availability.routes';
import reservationsRoutes from './modules/booking/reservations.routes';
import appointmentsRoutes from './modules/booking/appointments.routes';
import waitlistRoutes from './modules/waitlist/waitlist.routes';
import queueRoutes from './modules/queue/queue.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import reportsRoutes from './modules/reports/reports.routes';
import docsRoutes from './docs/swagger';
import cors from 'cors';
import { authLimiter, appointmentsLimiter } from './middleware/rateLimiter';
import { registerWaitlistEventSubscribers } from './modules/waitlist/waitlist.events';
import { registerNotificationSubscribers } from './modules/notifications/notifications.events';
import { initEventBusRedis } from './events/bus';

import { isOriginAllowed } from './lib/corsOrigins';

initEventBusRedis();
registerWaitlistEventSubscribers();
registerNotificationSubscribers();

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/appointments', appointmentsLimiter, appointmentsRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/docs', docsRoutes);

import http from 'http';
import { initSocketServer } from './realtime/socket';

async function ensureDefaultBranchHours(): Promise<void> {
  const branches = await prisma.branch.findMany({
    include: { business_hours: true }
  });

  for (const branch of branches) {
    if (branch.business_hours.length === 0) {
      await prisma.businessHour.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          branch_id: branch.id,
          day_of_week: day,
          open_time: '09:00',
          close_time: '17:00'
        }))
      });
      console.log(`[Startup] Seeded default business hours for branch: ${branch.name}`);
    }
  }
}

async function ensureDefaultBranchResources(): Promise<void> {
  const branches = await prisma.branch.findMany({
    include: { resources: true }
  });

  const defaultResources = [
    { name: 'Consultation Room 1', type: 'ROOM' },
    { name: 'Consultation Room 2', type: 'ROOM' },
    { name: 'Dental Chair 1', type: 'CHAIR' },
    { name: 'X-Ray Bay', type: 'BAY' },
    { name: 'Lab Counter 1', type: 'COUNTER' },
    { name: 'Lab Counter 2', type: 'COUNTER' },
    { name: 'Vaccination Booth', type: 'BOOTH' }
  ];

  for (const branch of branches) {
    if (branch.resources.length === 0) {
      await prisma.resource.createMany({
        data: defaultResources.map((r) => ({
          branch_id: branch.id,
          name: r.name,
          type: r.type,
          is_active: true
        }))
      });
      console.log(`[Startup] Seeded default resources for branch: ${branch.name}`);
    }
  }
}

async function ensureAdminSeeded(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || 'admin@queue.local';
  const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const password_hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN'
    },
    create: {
      email,
      password_hash,
      name: 'System Admin',
      role: 'ADMIN'
    }
  });

  console.log(`[Startup] Admin ensured: ${email}`);
}

export async function startServer() {
  await prisma.$connect();
  console.log('Database connected successfully');
  await ensureDefaultBranchHours();
  await ensureDefaultBranchResources();
  await ensureAdminSeeded();
  const server = http.createServer(app);
  initSocketServer(server);
  return server.listen(port, () => {
    console.log(`Backend server listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
}

export default app;
