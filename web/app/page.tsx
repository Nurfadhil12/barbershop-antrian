import { AddQueueForm } from '@/components/AddQueueForm';
import { ApiDiagnostics } from '@/components/ApiDiagnostics';
import { AutoRefresh } from '@/components/AutoRefresh';
import { DateNav } from '@/components/DateNav';
import { QueueActions } from '@/components/QueueActions';
import { StatusBadge } from '@/components/StatusBadge';
import { getBarbers, getQueues, getServices } from '@/lib/api';
import { jam, rupiah } from '@/lib/format';
import type { BarberView, QueueListResponse, ServiceView } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PapanAntrianPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;

  let data: QueueListResponse | null = null;
  let services: ServiceView[] = [];
  let barbers: BarberView[] = [];
  let error: string | null = null;

  try {
    [data, services, barbers] = await Promise.all([
      getQueues(date),
      getServices(true),
      getBarbers(true),
    ]);
  } catch (err) {
    error = (err as Error).message;
  }

  if (error || !data) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Papan Antrian</h1>
            <p>Terjadi masalah saat memuat data.</p>
          </div>
        </div>
        <div className="alert error">{error ?? 'Data tidak tersedia.'}</div>
        <ApiDiagnostics />
      </>
    );
  }

  const { summary, items, date: tanggal } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Papan Antrian</h1>
          <p>Nomor direset setiap hari. Klik Panggil saat pelanggan masuk kursi.</p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <DateNav date={tanggal} />
          <AutoRefresh seconds={20} />
        </div>
      </div>

      <div className="grid-stats">
        <div className="stat">
          <div className="label">Total</div>
          <div className="value">{summary.total}</div>
        </div>
        <div className="stat warn">
          <div className="label">Menunggu</div>
          <div className="value">{summary.waiting}</div>
        </div>
        <div className="stat info">
          <div className="label">Dilayani</div>
          <div className="value">{summary.inProgress}</div>
        </div>
        <div className="stat ok">
          <div className="label">Selesai</div>
          <div className="value">{summary.done}</div>
        </div>
        <div className="stat danger">
          <div className="label">Dibatalkan</div>
          <div className="value">{summary.cancelled}</div>
        </div>
        <div className="stat">
          <div className="label">Rata-rata layanan</div>
          <div className="value">{summary.avgServiceMinutes ?? '—'}</div>
          <div className="small muted">menit</div>
        </div>
      </div>

      {summary.serving && (
        <div className="serving-banner">
          <span className="badge IN_PROGRESS">sedang dilayani</span>
          <strong>{summary.serving.code}</strong>
          <span>{summary.serving.customerName}</span>
          {summary.next && (
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              berikutnya: {summary.next.code} · {summary.next.customerName}
            </span>
          )}
        </div>
      )}

      <div className="card">
        <h2>Ambil nomor antrian</h2>
        <AddQueueForm services={services} barbers={barbers} />
      </div>

      <div className="card">
        <h2>Daftar antrian · nomor terakhir {summary.lastNumber}</h2>
        {items.length === 0 ? (
          <p className="empty">Belum ada antrian pada tanggal ini.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Pelanggan</th>
                  <th>Layanan</th>
                  <th>Kapster</th>
                  <th>Waktu</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((queue) => (
                  <tr key={queue.id} className={queue.status === 'DONE' || queue.status === 'CANCELLED' ? 'row-done' : undefined}>
                    <td className="code">{queue.code}</td>
                    <td>
                      <div>{queue.customerName}</div>
                      {queue.customerPhone && <div className="small muted">{queue.customerPhone}</div>}
                      {queue.note && <div className="small muted">📝 {queue.note}</div>}
                    </td>
                    <td>
                      <div>{queue.service.name}</div>
                      <div className="small muted">
                        {queue.service.durationMin} mnt · {rupiah(queue.service.price)}
                      </div>
                    </td>
                    <td>{queue.barber ? queue.barber.name : <span className="muted">—</span>}</td>
                    <td className="small muted">
                      <div>ambil {jam(queue.createdAt)}</div>
                      {queue.startedAt && <div>mulai {jam(queue.startedAt)}</div>}
                      {queue.finishedAt && <div>selesai {jam(queue.finishedAt)}</div>}
                    </td>
                    <td>
                      <StatusBadge status={queue.status} />
                    </td>
                    <td>
                      <QueueActions queue={queue} barbers={barbers} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
