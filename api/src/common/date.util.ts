// Helper tanggal: antrian dihitung per hari menurut zona waktu toko, bukan UTC.
// Dipakai bersama oleh service antrian & seed.

export const SHOP_TIMEZONE = process.env.SHOP_TIMEZONE ?? 'Asia/Jakarta';

/** "2026-10-10" untuk hari ini menurut zona waktu toko. */
export function todayInShopTz(timeZone: string = SHOP_TIMEZONE, now: Date = new Date()): string {
  // 'en-CA' menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "2026-10-10" -> Date pada tengah malam UTC (kolom @db.Date). */
export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Format tanggal harus YYYY-MM-DD, diterima: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Tanggal tidak valid: ${value}`);
  }
  return date;
}

/** Date (kolom @db.Date) -> "2026-10-10". */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Nomor antrian -> kode tampilan, mis. 7 -> "A-007". */
export function formatQueueCode(number: number): string {
  return `A-${String(number).padStart(3, '0')}`;
}
