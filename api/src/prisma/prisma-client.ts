/**
 * Barrel untuk Prisma Client.
 *
 * Prisma 7 men-generate client sebagai kode sumber TypeScript di
 * `src/generated/prisma` (lihat prisma/schema.prisma → generator `prisma-client`).
 * Semua kode aplikasi mengimpor dari sini supaya tidak ada path generated yang
 * tersebar di banyak file.
 */
export { PrismaClient, Prisma, QueueStatus } from '../generated/prisma/client';
export type { Service, Barber, Queue } from '../generated/prisma/client';
