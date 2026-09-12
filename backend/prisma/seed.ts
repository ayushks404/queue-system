import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding MediQ Hospital OPD data...');

  const branchesData = [
    { name: 'MediQ City Hospital — Main Campus', address: '12 MG Road, Gurugram', phone: '+91 124 4567890' },
    { name: 'MediQ North Wing', address: 'Sector 45, Gurugram', phone: '+91 124 4567891' },
    { name: 'MediQ Diagnostics Center', address: 'DLF Phase 3, Gurugram', phone: '+91 124 4567892' }
  ];

  for (const b of branchesData) {
    const existingBranch = await prisma.branch.findFirst({ where: { name: b.name } });
    let branchId = existingBranch?.id;
    if (existingBranch) {
      await prisma.branch.update({
        where: { id: existingBranch.id },
        data: { address: b.address, phone: b.phone, is_active: true }
      });
    } else {
      const created = await prisma.branch.create({
        data: { name: b.name, address: b.address, phone: b.phone, is_active: true }
      });
      branchId = created.id;
    }

    if (branchId) {
      const existingHours = await prisma.businessHour.findMany({ where: { branch_id: branchId } });
      if (existingHours.length === 0) {
        await prisma.businessHour.createMany({
          data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            branch_id: branchId,
            day_of_week: day,
            open_time: '08:00',
            close_time: '20:00'
          }))
        });
      }

      const resources = [
        { name: 'Consultation Room 1', type: 'ROOM' },
        { name: 'Consultation Room 2', type: 'ROOM' },
        { name: 'Dental Chair 1', type: 'CHAIR' },
        { name: 'X-Ray Bay', type: 'BAY' },
        { name: 'Lab Counter 1', type: 'COUNTER' },
        { name: 'Lab Counter 2', type: 'COUNTER' },
        { name: 'Vaccination Booth', type: 'BOOTH' }
      ];

      for (const r of resources) {
        const existingRes = await prisma.resource.findFirst({
          where: { branch_id: branchId, name: r.name }
        });
        if (!existingRes) {
          await prisma.resource.create({
            data: {
              branch_id: branchId,
              name: r.name,
              type: r.type,
              is_active: true
            }
          });
        }
      }
    }
  }

  // Seed services (departments)
  const servicesData = [
    { name: 'General OPD Consultation', duration: 15, price: 300, capacity: 1, resourceType: 'ROOM', desc: 'Primary medical checkup and consultation' },
    { name: 'Dermatology Consultation', duration: 20, price: 600, capacity: 1, resourceType: 'ROOM', desc: 'Skin, hair, and dermatological consultation' },
    { name: 'Dental Checkup', duration: 30, price: 500, capacity: 1, resourceType: 'CHAIR', desc: 'Routine dental screening and cleaning' },
    { name: 'Pediatrics Consultation', duration: 15, price: 400, capacity: 1, resourceType: 'ROOM', desc: 'Child health examination and general checkup' },
    { name: 'Blood Test / Lab Work', duration: 10, price: 250, capacity: 2, resourceType: 'COUNTER', desc: 'Diagnostic blood draws and pathology sampling' },
    { name: 'X-Ray Scan', duration: 15, price: 800, capacity: 1, resourceType: 'BAY', desc: 'Radiology imaging and diagnostic scans' },
    { name: 'Vaccination', duration: 10, price: 200, capacity: 1, resourceType: 'BOOTH', desc: 'Immunization and routine vaccine administration' }
  ];

  for (const s of servicesData) {
    const existing = await prisma.service.findFirst({ where: { name: s.name } });
    let service: any;
    if (existing) {
      service = await prisma.service.update({
        where: { id: existing.id },
        data: {
          duration_minutes: s.duration,
          price: s.price,
          capacity: s.capacity,
          description: s.desc,
          is_active: true
        }
      });
    } else {
      service = await prisma.service.create({
        data: {
          name: s.name,
          duration_minutes: s.duration,
          price: s.price,
          capacity: s.capacity,
          description: s.desc,
          is_active: true
        }
      });
    }

    // Link required resource type
    await prisma.serviceResource.deleteMany({ where: { service_id: service.id } });
    await prisma.serviceResource.create({
      data: {
        service_id: service.id,
        resource_type: s.resourceType
      }
    });
  }

  console.log('MediQ Hospital OPD data seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
