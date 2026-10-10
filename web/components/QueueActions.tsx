'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client-api';
import type { BarberView, QueueView } from '@/lib/types';

/**
 * Tombol aksi per antrian. Aturan tombolnya mengikuti status dari server:
 *   WAITING     -> Panggil, Batal, Hapus
 *   IN_PROGRESS -> Selesai, Batal, Hapus
 *   DONE/CANCELLED -> Hapus
 * Kapster wajib dipilih kalau antrian belum punya kapster dan ada >1 kapster aktif.
 */
export function QueueActions({ queue, barbers }: { queue: QueueView; barbers: BarberView[] }) {
  const router = useRouter();
  const [barberId, setBarberId] = useState<string>(queue.barberId ? String(queue.barberId) : '');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const perluPilihKapster = !queue.barberId && barbers.length > 1;

  async function jalankan(aksi: string, fn: () => Promise<unknown>) {
    setSibuk(aksi);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div>
      <div className="actions">
        {queue.status === 'WAITING' && (
          <>
            {perluPilihKapster && (
              <select
                value={barberId}
                onChange={(event) => setBarberId(event.target.value)}
                style={{ width: 'auto' }}
                aria-label="Pilih kapster"
              >
                <option value="">pilih kapster…</option>
                {barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="info small"
              disabled={sibuk !== null || (perluPilihKapster && !barberId)}
              title={perluPilihKapster && !barberId ? 'Pilih kapster dulu' : 'Panggil pelanggan'}
              onClick={() =>
                jalankan('start', () =>
                  apiSend('POST', `/queues/${queue.id}/start`, barberId ? { barberId: Number(barberId) } : {}),
                )
              }
            >
              {sibuk === 'start' ? '…' : 'Panggil'}
            </button>
          </>
        )}

        {queue.status === 'IN_PROGRESS' && (
          <button
            className="ok small"
            disabled={sibuk !== null}
            onClick={() => jalankan('finish', () => apiSend('POST', `/queues/${queue.id}/finish`))}
          >
            {sibuk === 'finish' ? '…' : 'Selesai'}
          </button>
        )}

        {(queue.status === 'WAITING' || queue.status === 'IN_PROGRESS') && (
          <button
            className="small"
            disabled={sibuk !== null}
            onClick={() => jalankan('cancel', () => apiSend('POST', `/queues/${queue.id}/cancel`))}
          >
            {sibuk === 'cancel' ? '…' : 'Batal'}
          </button>
        )}

        <button
          className="danger small"
          disabled={sibuk !== null}
          onClick={() => {
            if (!window.confirm(`Hapus antrian ${queue.code} (${queue.customerName})?`)) return;
            void jalankan('delete', () => apiSend('DELETE', `/queues/${queue.id}`));
          }}
        >
          {sibuk === 'delete' ? '…' : 'Hapus'}
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: 'var(--danger)', marginTop: 6, maxWidth: 340 }}>
          {error}
        </div>
      )}
    </div>
  );
}
