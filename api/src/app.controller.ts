import { Controller, Get, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/ping — sengaja TIDAK menyentuh database, dan tidak bergantung pada
   * PrismaService (inject-nya opsional lewat dekorator @Optional? tidak: PrismaService
   * tetap di-inject karena health butuh, tapi ping tidak memanggil query apa pun).
   *
   * Gunanya saat diagnosa deploy: kalau /api/ping hidup tapi /api/health gagal,
   * masalahnya di database. Kalau keduanya tidak bisa diakses sama sekali,
   * masalahnya di boot/bundling aplikasi.
   */
  @Get('ping')
  ping() {
    return { pong: true, service: 'barbershop-queue-api', time: new Date().toISOString() };
  }

  /**
   * GET /api/health — dipakai healthcheck, smoke test, dan (yang terpenting saat
   * deploy) untuk tahu MENGAPA API tidak bisa melayani: apakah URL database belum
   * di-set, host-nya salah, atau kredensialnya ditolak. Tidak pernah membocorkan
   * kredensial — hanya host.
   */
  @Get('health')
  async health() {
    const startedAt = Date.now();
    let db: 'up' | 'down' = 'down';
    let error: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch (cause) {
      error = (cause as Error).message?.slice(0, 300) ?? 'query gagal';
      this.logger.error(`Health check: query database gagal — ${error.split('\n')[0]}`);
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      latencyMs: Date.now() - startedAt,
      dbSource: this.prisma.urlSource,
      dbHost: this.prisma.urlHost,
      hint: this.prisma.urlMissing
        ? 'DATABASE_URL belum di-set. Pasang database (mis. integrasi Neon) atau set env var DATABASE_URL/POSTGRES_PRISMA_URL/POSTGRES_URL.'
        : null,
      error,
      service: 'barbershop-queue-api',
      time: new Date().toISOString(),
    };
  }
}
