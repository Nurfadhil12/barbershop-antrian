/**
 * Seed data awal barbershop: 5 layanan, 3 kapster, dan contoh antrian hari ini.
 * Aman dijalankan berulang (upsert untuk layanan/kapster; antrian hanya dibuat
 * kalau hari ini belum ada antrian sama sekali).
 *
 * Jalankan: npm run seed        (lokal, butuh DATABASE_URL)
 *           make seed           (di deployment/)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveDatabaseUrl } from '../src/common/database-url';
import { formatQueueCode, parseDateOnly, todayInShopTz } from '../src/common/date.util';
import { PrismaClient } from '../src/prisma/prisma-client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }) });

const SERVICES = [
  { name: 'Potong Rambut', durationMin: 30, price: 40_000 },
  { name: 'Cukur Jenggot', durationMin: 20, price: 25_000 },
  { name: 'Potong + Cukur', durationMin: 45, price: 60_000 },
  { name: 'Cuci + Blow', durationMin: 20, price: 30_000 },
  { name: 'Cat Rambut', durationMin: 90, price: 150_000 },
];

const BARBERS = [
  { name: 'Budi', phone: '0812-1111-2222' },
  { name: 'Rangga', phone: '0813-3333-4444' },
  { name: 'Sari', phone: '0857-5555-6666' },
];

async function main() {
  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { name: service.name },
      update: {},
      create: service,
    });
  }
  console.log(`[seed] layanan: ${SERVICES.length} (upsert)`);

  for (const barber of BARBERS) {
    await prisma.barber.upsert({
      where: { name: barber.name },
      update: {},
      create: barber,
    });
  }
  console.log(`[seed] kapster: ${BARBERS.length} (upsert)`);

  const dateStr = todayInShopTz();
  const queueDate = parseDateOnly(dateStr);
  const existing = await prisma.queue.count({ where: { queueDate } });

  if (existing > 0) {
    console.log(`[seed] antrian ${dateStr} sudah ada (${existing} baris) — contoh antrian dilewati`);
    return;
  }

  const potong = await prisma.service.findUniqueOrThrow({ where: { name: 'Potong Rambut' } });
  const potongCukur = await prisma.service.findUniqueOrThrow({ where: { name: 'Potong + Cukur' } });
  const jenggot = await prisma.service.findUniqueOrThrow({ where: { name: 'Cukur Jenggot' } });
  const budi = await prisma.barber.findUniqueOrThrow({ where: { name: 'Budi' } });
  const rangga = await prisma.barber.findUniqueOrThrow({ where: { name: 'Rangga' } });

  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000);

  const samples = [
    {
      number: 1,
      customerName: 'Andi Saputra',
      customerPhone: '0812-9000-1111',
      status: 'DONE' as const,
      serviceId: potong.id,
      barberId: budi.id,
      startedAt: minutesAgo(75),
      finishedAt: minutesAgo(45),
    },
    {
      number: 2,
      customerName: 'Dewi Lestari',
      status: 'DONE' as const,
      serviceId: jenggot.id,
      barberId: rangga.id,
      startedAt: minutesAgo(40),
      finishedAt: minutesAgo(20),
    },
    {
      number: 3,
      customerName: 'Hendra Wijaya',
      customerPhone: '0857-1234-5678',
      status: 'IN_PROGRESS' as const,
      serviceId: potongCukur.id,
      barberId: budi.id,
      startedAt: minutesAgo(10),
      note: 'Minta model fade',
    },
    { number: 4, customerName: 'Rina Marlina', status: 'WAITING' as const, serviceId: potong.id },
    { number: 5, customerName: 'Joko Prasetyo', status: 'WAITING' as const, serviceId: jenggot.id },
  ];

  for (const sample of samples) {
    await prisma.queue.create({
      data: {
        ...sample,
        code: formatQueueCode(sample.number),
        queueDate,
      },
    });
  }
  console.log(`[seed] contoh antrian ${dateStr}: ${samples.length} baris`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('[seed] gagal:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
