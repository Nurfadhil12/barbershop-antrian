import Link from 'next/link';
import { ApiDiagnostics } from '@/components/ApiDiagnostics';
import { DateNav } from '@/components/DateNav';
import { StatusBadge } from '@/components/StatusBadge';
import { apiGet } from '@/lib/api';
import { STATUS_LABEL, STATUS_ORDER, durasiMenit, hariIni, jam, rupiah } from '@/lib/format';
import type { QueueListResponse, QueueStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const today = hariIni();
  const date = params.date ?? today;
  const status = STATUS_ORDER.includes(params.status as QueueStatus) ? (params.status as QueueStatus) : undefined;
  const q = params.q?.trim() ?? '';

  const query = new URLSearchParams({ date });
  if (status) query.set('status', status);
  if (q) query.set('q', q);

  let data: QueueListResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiGet<QueueListResponse>(`/queues?${query.toString()}`);
  } catch (err) {
    error = (err as Error).message;
  }

  const totalNilai =
    data?.items
      .filter((item) => item.status === 'DONE')
      .reduce((sum, item) => sum + item.service.price, 0) ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Riwayat Antrian</h1>
          <p>Cari antrian per tanggal, saring berdasarkan status, atau cari nama/kode.</p>
        </div>
        <DateNav date={date} />
      </div>

      <div className="card">
        <form className="toolbar" method="get" action="/riwayat">
          <label className="field">
            Tanggal
            <input type="date" name="date" defaultValue={date} />
          </label>
          <label className="field">
            Status
            <select name="status" defaultValue={status ?? ''}>
              <option value="">semua status</option>
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Cari
            <input name="q" defaultValue={q} placeholder="nama, kode, atau no. HP" />
          </label>
          <div className="actions">
            <button className="primary" type="submit">
              Terapkan
            </button>
            <Link className="pill" href="/riwayat" style={{ alignSelf: 'center' }}>
              Reset
            </Link>
          </div>
        </form>
      </div>

      {error ? (
        <>
          <div className="alert error">{error}</div>
          <ApiDiagnostics />
        </>
      ) : (
        <div className="card">
          <h2>
            {data?.items.length ?? 0} antrian · nilai layanan selesai {rupiah(totalNilai)}
          </h2>
          {data && data.items.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Pelanggan</th>
                    <th>Layanan</th>
                    <th>Kapster</th>
                    <th>Mulai</th>
                    <th>Selesai</th>
                    <th>Durasi</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="code">{item.code}</td>
                      <td>
                        <div>{item.customerName}</div>
                        {item.customerPhone && <div className="small muted">{item.customerPhone}</div>}
                      </td>
                      <td>
                        <div>{item.service.name}</div>
                        <div className="small muted">{rupiah(item.service.price)}</div>
                      </td>
                      <td>{item.barber?.name ?? <span className="muted">—</span>}</td>
                      <td className="small muted">{jam(item.startedAt)}</td>
                      <td className="small muted">{jam(item.finishedAt)}</td>
                      <td className="small muted">{durasiMenit(item.startedAt, item.finishedAt)}</td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">Tidak ada antrian yang cocok dengan filter ini.</p>
          )}
        </div>
      )}
    </>
  );
}
