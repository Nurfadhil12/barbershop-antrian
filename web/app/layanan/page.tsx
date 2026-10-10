import { ServiceManager } from '@/components/ServiceManager';
import { getServices } from '@/lib/api';
import type { ServiceView } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LayananPage() {
  let services: ServiceView[] = [];
  let error: string | null = null;
  try {
    services = await getServices();
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Layanan</h1>
          <p>
            Daftar jasa yang bisa diambil pelanggan. Layanan yang sudah pernah dipakai tidak bisa dihapus —
            nonaktifkan saja supaya hilang dari pilihan.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert error">{error}</div>
      ) : (
        <div className="card">
          <h2>Kelola layanan</h2>
          <ServiceManager services={services} />
        </div>
      )}
    </>
  );
}
