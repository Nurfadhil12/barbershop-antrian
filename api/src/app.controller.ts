import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

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
