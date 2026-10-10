'use client';

import { useEffect, useState } from 'react';

interface MigrateStatus {
  status?: string;
  attempts?: number;
  error?: string | null;
  updatedAt?: string;
}

interface HealthResponse {
  status?: string;
  db?: string;
  schema?: string;
  migrate?: MigrateStatus | null;
  latencyMs?: number;
  dbSource?: string;
  dbHost?: string;
  hint?: string | null;
  error?: string | null;
  service?: string;
  time?: string;
}

/**
 * Panel diagnostik yang muncul saat halaman gagal memuat data.
 *
 * Memanggil /api/health dari browser (same-origin, lewat rewrite Vercel/Nginx) lalu
 * menampilkan apa yang dilaporkan API: apakah URL database ada dan dari env var mana
 * (dbSource), host mana yang dituju (dbHost), dan pesan error aslinya. Tujuannya:
 * satu kali buka halaman, penyebabnya langsung kelihatan — tidak perlu menebak atau
 * membaca log. Isinya aman dibagikan (tidak ada kredensial, hanya host).
 */
export function ApiDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const text = await res.text();
        if (cancelled) return;
        try {
          setHealth(JSON.parse(text) as HealthResponse);
        } catch {
          setFetchError(`HTTP ${res.status} · isi non-JSON: "${text.replace(/\s+/g, ' ').slice(0, 120)}"`);
        }
      } catch (error) {
        if (!cancelled) setFetchError((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Array<[string, string]> = [];
  if (health) {
    rows.push(['status API', String(health.status ?? '—')]);
    rows.push(['database', String(health.db ?? '—')]);
    if (health.schema) {
      rows.push([
        'skema database',
        health.schema === 'ok' ? 'ok (tabel ada)' : health.schema === 'missing' ? 'BELUM ADA (tabel belum dimigrasi)' : '—',
      ]);
    }
    if (health.migrate) {
      const label: Record<string, string> = {
        done: 'selesai',
        pending: 'sedang berjalan',
        failed: 'GAGAL',
        disabled: 'dimatikan (RUN_MIGRATIONS=false)',
      };
      rows.push([
        'migrasi otomatis',
        `${label[String(health.migrate.status)] ?? String(health.migrate.status)}${health.migrate.attempts ? ` (percobaan ${health.migrate.attempts})` : ''}`,
      ]);
      if (health.migrate.error) rows.push(['error migrasi', health.migrate.error]);
    }
    rows.push(['URL database dari', String(health.dbSource ?? '—')]);
    rows.push(['host database', String(health.dbHost ?? '—')]);
    if (typeof health.latencyMs === 'number') rows.push(['latensi query', `${health.latencyMs} ms`]);
    if (health.hint) rows.push(['petunjuk', health.hint]);
    if (health.error) rows.push(['error database', health.error.split('\n').find((l) => l.trim()) ?? health.error]);
  }

  return (
    <div className="card">
      <h2>Diagnostik API</h2>

      {loading && <p className="muted small">Memeriksa /api/health…</p>}

      {fetchError && (
        <>
          <div className="alert error">Tidak bisa membaca /api/health: {fetchError}</div>
          <p className="small muted">
            Kalau /api/health pun tidak bisa diakses, masalahnya bukan di database melainkan di service
            API itu sendiri (cek log service api di dashboard Vercel).
          </p>
        </>
      )}

      {rows.length > 0 && (
        <>
          <table>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td className="small muted" style={{ width: 180 }}>
                    {label}
                  </td>
                  <td className="small">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>
            Isi ini aman dibagikan — hanya host, tanpa kredensial.{' '}
            {health?.db === 'down' && health?.dbSource === 'placeholder'
              ? 'URL database belum di-set: pasang database (Neon) dari Marketplace, lalu redeploy.'
              : ''}
            {health?.db === 'down' && health?.dbSource !== 'placeholder'
              ? 'URL database sudah ada tapi tidak bisa dijangkau: periksa isi DATABASE_URL (host/pooler/sslmode), lalu redeploy.'
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
