import 'dotenv/config';
import express from 'express';
import { prisma } from './lib/prisma';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

async function main() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
    
    app.listen(port, () => {
      console.log(`Backend server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to database', error);
    process.exit(1);
  }
}

main();

export default app;
