// Pemanggil API untuk Server Component (Next server -> API NestJS).
// Di container: INTERNAL_API_URL=http://api:3000 (langsung, tanpa lewat Nginx).
// Di lokal:     default http://localhost:3210.

import 'server-only';

import type { BarberView, QueueListResponse, ServiceView } from './types';

const ORIGIN = (process.env.INTERNAL_API_URL ?? 'http://localhost:3210').replace(/\/$/, '');
const PREFIX = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string): Promise<T> {
  const url = `${ORIGIN}${PREFIX}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ApiError(`Tidak bisa menghubungi API (${url}).`, 0);
  }

  const text = await res.text();

  // Respons non-JSON = hampir selalu halaman error dari platform (Vercel mengirim
  // teks polos seperti "A server error has occurred"), bukan dari aplikasi kita.
  // Tampilkan status + potongan body supaya penyebabnya kelihatan, jangan disembunyikan
  // di balik error JSON.parse.
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
      throw new ApiError(
        `API menjawab dengan ${res.status} dan isi non-JSON (${url}): "${snippet}". ` +
          `Periksa log service api dan pastikan DATABASE_URL sudah di-set.`,
        res.status,
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(extractMessage(data, res.status), res.status);
  }
  return data as T;
}

function extractMessage(data: unknown, status: number): string {
  const body = data as { message?: unknown; code?: unknown } | null;
  const message = body?.message;

  // Sertakan kode error Prisma (mis. P2021) supaya penyebabnya bisa dicari langsung.
  const code = typeof body?.code === 'string' ? ` (kode ${body.code})` : '';

  if (Array.isArray(message)) return `${message.join(', ')}${code}`;
  if (typeof message === 'string') return `${message}${code}`;
  return `Permintaan gagal (HTTP ${status})${code}.`;
}

export const apiGet = request;

export const getQueues = (date?: string) =>
  apiGet<QueueListResponse>(`/queues${date ? `?date=${date}` : ''}`);

export const getServices = (activeOnly = false) =>
  apiGet<ServiceView[]>(`/services${activeOnly ? '?activeOnly=true' : ''}`);

export const getBarbers = (activeOnly = false) =>
  apiGet<BarberView[]>(`/barbers${activeOnly ? '?activeOnly=true' : ''}`);
