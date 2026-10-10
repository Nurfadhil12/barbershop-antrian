import type { QueueStatus } from './types';

export const STATUS_LABEL: Record<QueueStatus, string> = {
  WAITING: 'Menunggu',
  IN_PROGRESS: 'Dilayani',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const STATUS_ORDER: QueueStatus[] = ['WAITING', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

export function rupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function jam(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function tanggalPanjang(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Geser tanggal "YYYY-MM-DD" sebanyak N hari (boleh negatif). */
export function geserTanggal(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Tanggal hari ini menurut zona waktu toko. */
export function hariIni(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function durasiMenit(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const minutes = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return `${minutes} menit`;
}
