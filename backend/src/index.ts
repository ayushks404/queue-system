import 'dotenv/config';
import express from 'express';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import branchRoutes from './modules/catalog/branches.routes';
import serviceRoutes from './modules/catalog/services.routes';
import resourceRoutes from './modules/catalog/resources.routes';
import availabilityRoutes from './modules/booking/availability.routes';
import reservationsRoutes from './modules/booking/reservations.routes';
import appointmentsRoutes from './modules/booking/appointments.routes';
import waitlistRoutes from './modules/waitlist/waitlist.routes';
import queueRoutes from './modules/queue/queue.routes';
import { registerWaitlistEventSubscribers } from './modules/waitlist/waitlist.events';

registerWaitlistEventSubscribers();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/queue', queueRoutes);

import http from 'http';
import { initSocketServer } from './realtime/socket';

export async function startServer() {
  await prisma.$connect();
  console.log('Database connected successfully');
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
