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
  } catch (cause) {
    throw new ApiError(`Tidak bisa menghubungi API (${url}).`, 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(extractMessage(data, res.status), res.status);
  }
  return data as T;
}

function extractMessage(data: unknown, status: number): string {
  const message = (data as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  return `Permintaan gagal (HTTP ${status}).`;
}

export const apiGet = request;

export const getQueues = (date?: string) =>
  apiGet<QueueListResponse>(`/queues${date ? `?date=${date}` : ''}`);

export const getServices = (activeOnly = false) =>
  apiGet<ServiceView[]>(`/services${activeOnly ? '?activeOnly=true' : ''}`);

export const getBarbers = (activeOnly = false) =>
  apiGet<BarberView[]>(`/barbers${activeOnly ? '?activeOnly=true' : ''}`);
