import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@queue.local';
  const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const password_hash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password_hash,
      role: 'ADMIN'
    },
    create: {
      email,
      password_hash,
      name: 'System Admin',
      role: 'ADMIN'
    }
  });

  console.log(`Admin user seeded successfully: ${admin.email} (Role: ${admin.role})`);
  return admin;
}

if (require.main === module) {
  seedAdmin()
    .catch((err) => {
      console.error('Failed to seed admin', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
