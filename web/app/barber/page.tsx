import { BarberManager } from '@/components/BarberManager';
import { getBarbers } from '@/lib/api';
import type { BarberView } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BarberPage() {
  let barbers: BarberView[] = [];
  let error: string | null = null;
  try {
    barbers = await getBarbers();
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kapster</h1>
          <p>
            Kapster aktif muncul di pilihan saat memanggil antrian. Kapster yang sudah pernah menangani
            antrian tidak bisa dihapus — nonaktifkan saja.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert error">{error}</div>
      ) : (
        <div className="card">
          <h2>Kelola kapster</h2>
          <BarberManager barbers={barbers} />
        </div>
      )}
    </>
  );
}
