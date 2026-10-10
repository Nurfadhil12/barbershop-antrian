/**
 * Menentukan URL database sesuai lingkungan.
 *
 * - Docker/VPS lokal: DATABASE_URL (lihat deployment/docker-compose.yml)
 * - Vercel + Neon: integrasi Neon menyuntik beberapa nama sekaligus. Yang dipakai
 *   runtime adalah koneksi **pooled**; kalau namanya berbeda-beda antar versi
 *   integrasi, urutan di bawah ini yang menentukan.
 *
 * Jangan memakai DIRECT_URL/POSTGRES_URL_NON_POOLING di sini: itu untuk perintah
 * CLI Prisma (migrate) yang butuh koneksi langsung, bukan untuk trafik aplikasi.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidates: Array<[string, string | undefined]> = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['POSTGRES_PRISMA_URL', env.POSTGRES_PRISMA_URL],
    ['POSTGRES_URL', env.POSTGRES_URL],
  ];

  for (const [name, value] of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(
    'URL database tidak ditemukan. Set DATABASE_URL (atau POSTGRES_PRISMA_URL / POSTGRES_URL ' +
      'kalau memakai integrasi Neon di Vercel) di environment.',
  );
}
