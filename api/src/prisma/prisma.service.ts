import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import * as vercelFunctions from '@vercel/functions';
import { Pool } from 'pg';
import { safeDatabaseUrl, type DatabaseUrlInfo, type DatabaseUrlSource } from '../common/database-url';
import { PrismaClient } from './prisma-client';

/**
 * Prisma 7 memakai driver adapter (bukan lagi URL di schema.prisma).
 *
 * Dua keputusan penting di sini, keduanya karena komputasi serverless:
 *
 * 1. Koneksi lewat `pg.Pool` + `attachDatabasePool` (@vercel/functions) — pool
 *    menguntungkan di Vercel Fluid compute (instance dipakai ulang antar-request),
 *    tapi harus ditutup rapi sebelum function disuspend. Di luar Vercel tidak
 *    berpengaruh apa-apa.
 *
 * 2. **Boot tidak pernah gagal karena database.** URL yang hilang hanya menghasilkan
 *    placeholder + log, dan `$connect()` yang gagal ditangkap. Kalau tidak, satu env
 *    var yang kurang membuat seluruh service crash dan pengguna hanya melihat
 *    "A server error has occurred" dari platform — tanpa petunjuk apa pun.
 *    Dengan begini `/api/health` tetap bisa diakses dan melaporkan penyebabnya.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly info: DatabaseUrlInfo;
  private readonly pool: Pool;

  /** Asal URL: DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL / DIRECT_URL / placeholder. */
  readonly urlSource: DatabaseUrlSource;
  /** Host database (tanpa kredensial) untuk diagnostik. */
  readonly urlHost: string;
  readonly urlMissing: boolean;

  constructor() {
    // Semua dihitung sebagai variabel lokal dulu: 'this' belum boleh dipakai
    // sebelum super(), karena PrismaClient adalah kelas turunan.
    const info = safeDatabaseUrl();
    const pool = new Pool({
      connectionString: info.url,
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

    this.info = info;
    this.pool = pool;
    this.urlSource = info.source;
    this.urlHost = info.host;
    this.urlMissing = info.missing;

    if (info.missing) {
      this.logger.error(
        'DATABASE_URL tidak ditemukan (juga POSTGRES_PRISMA_URL/POSTGRES_URL). ' +
          'API tetap hidup, tapi semua query database akan gagal — pasang database ' +
          '(mis. integrasi Neon di Vercel) atau set env var-nya.',
      );
    } else {
      this.logger.log(`Database dari ${info.source} → ${info.host}`);
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Terhubung ke PostgreSQL');
    } catch (error) {
      // Jangan jatuhkan proses: biarkan /api/health melaporkan masalahnya.
      this.logger.error(`Gagal menyambung ke PostgreSQL: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
