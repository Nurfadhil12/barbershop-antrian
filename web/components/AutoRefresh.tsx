'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Menyegarkan data server component secara berkala supaya papan antrian tetap
 * terbaru di layar kasir tanpa perlu menekan apa pun.
 */
export function AutoRefresh({ seconds = 20, label = 'auto-refresh' }: { seconds?: number; label?: string }) {
  const router = useRouter();
  const [aktif, setAktif] = useState(true);

  useEffect(() => {
    if (!aktif) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [aktif, router, seconds]);

  return (
    <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="checkbox"
        checked={aktif}
        onChange={(event) => setAktif(event.target.checked)}
        style={{ width: 'auto' }}
      />
      {label} tiap {seconds}s
    </label>
  );
}
