// api/prisma7.config.ts — konfigurasi Prisma CLI (migrate, generate, db pull).
// Prisma 7 tidak lagi membaca `url` dari schema.prisma; URL koneksi untuk migrasi
// diambil dari sini (DATABASE_URL tetap dari environment compose/.env).
// Runtime aplikasi TIDAK memakai file ini — lihat src/prisma/prisma.service.ts
// yang memakai driver adapter @prisma/adapter-pg.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
