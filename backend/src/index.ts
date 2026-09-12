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
import cors from 'cors';
import { authLimiter, appointmentsLimiter } from './middleware/rateLimiter';
import { registerWaitlistEventSubscribers } from './modules/waitlist/waitlist.events';
import { registerNotificationSubscribers } from './modules/notifications/notifications.events';

registerWaitlistEventSubscribers();
registerNotificationSubscribers();

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost',
  'http://localhost:80',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1',
  'http://127.0.0.1:80',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as curl, supertest, mobile apps, same-origin)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
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

import http from 'http';
import { initSocketServer } from './realtime/socket';

async function ensureAdminSeeded(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || 'admin@queue.local';
  const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const password_hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { password_hash, role: 'ADMIN' },
    create: { email, password_hash, name: 'System Admin', role: 'ADMIN' }
  });

  console.log(`[Startup] Admin account ready: ${email}`);
}

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

export async function startServer() {
  await prisma.$connect();
  console.log('Database connected successfully');
  await ensureAdminSeeded();
  await ensureDefaultBranchHours();
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
