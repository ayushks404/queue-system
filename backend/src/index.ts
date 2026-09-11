import 'dotenv/config';
import express from 'express';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import branchRoutes from './modules/catalog/branches.routes';
import serviceRoutes from './modules/catalog/services.routes';
import resourceRoutes from './modules/catalog/resources.routes';

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

export async function startServer() {
  await prisma.$connect();
  console.log('Database connected successfully');
  return app.listen(port, () => {
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
