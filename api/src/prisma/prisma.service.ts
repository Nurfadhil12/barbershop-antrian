import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import * as vercelFunctions from '@vercel/functions';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '../common/database-url';
import { PrismaClient } from './prisma-client';

/**
 * Prisma 7 memakai driver adapter (bukan lagi URL di schema.prisma).
 *
 * Kenapa lewat `pg.Pool` dan bukan `{ connectionString }` langsung:
 * di Vercel (Fluid compute) instance function dipakai ulang antar-request, jadi
 * pool koneksi itu menguntungkan — TAPI harus ditutup rapi sebelum function
 * disuspend, kalau tidak koneksi menumpuk dan kena limit database.
 * `attachDatabasePool` dari @vercel/functions menangani itu; di luar Vercel
 * pemanggilannya tidak berbahaya (tidak ada lifecycle Vercel yang terpasang).
 * PrismaPg menerima `pg.Pool | pg.PoolConfig | string`, jadi pool ini dipakai
 * langsung.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = resolveDatabaseUrl();
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10_000),
    });

    if (typeof vercelFunctions.attachDatabasePool === 'function') {
      try {
        vercelFunctions.attachDatabasePool(pool);
      } catch {
        // bukan lingkungan Vercel — abaikan
      }
    }

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Terhubung ke PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => undefined);
  }
}
