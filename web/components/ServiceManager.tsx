'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client-api';
import { rupiah } from '@/lib/format';
import type { ServiceView } from '@/lib/types';

type Draf = { name: string; durationMin: string; price: string };

const DRAF_KOSONG: Draf = { name: '', durationMin: '30', price: '0' };

export function ServiceManager({ services }: { services: ServiceView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ServiceView[]>(services);
  const [draf, setDraf] = useState<Draf>(DRAF_KOSONG);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraf, setEditDraf] = useState<Draf>(DRAF_KOSONG);
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'error'; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // Data dari server component disinkronkan (mis. setelah router.refresh())
  useEffect(() => setRows(services), [services]);

  const bisaTambah = draf.name.trim().length >= 2 && !sibuk;

  async function jalankan(aksi: () => Promise<void>) {
    setSibuk(true);
    setPesan(null);
    try {
      await aksi();
      router.refresh();
    } catch (error) {
      setPesan({ tipe: 'error', teks: (error as Error).message });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      {pesan && <div className={`alert ${pesan.tipe === 'ok' ? 'success' : 'error'}`}>{pesan.teks}</div>}

      <form
        className="inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (!bisaTambah) return;
          void jalankan(async () => {
            const created = await apiSend<ServiceView>('POST', '/services', {
              name: draf.name.trim(),
              durationMin: Number(draf.durationMin || 30),
              price: Number(draf.price || 0),
            });
            setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            setDraf(DRAF_KOSONG);
            setPesan({ tipe: 'ok', teks: `Layanan "${created.name}" ditambahkan.` });
          });
        }}
      >
        <label className="field">
          Nama layanan *
          <input
            value={draf.name}
            onChange={(event) => setDraf({ ...draf, name: event.target.value })}
            placeholder="mis. Potong Rambut"
            maxLength={80}
            required
          />
        </label>
        <label className="field">
          Durasi (menit)
          <input
            type="number"
            min={5}
            max={480}
            value={draf.durationMin}
            onChange={(event) => setDraf({ ...draf, durationMin: event.target.value })}
          />
        </label>
        <label className="field">
          Harga (Rp)
          <input
            type="number"
            min={0}
            value={draf.price}
            onChange={(event) => setDraf({ ...draf, price: event.target.value })}
          />
        </label>
        <div>
          <button className="primary" type="submit" disabled={!bisaTambah}>
            Tambah layanan
          </button>
        </div>
      </form>

      <div style={{ overflowX: 'auto', marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Durasi</th>
              <th>Harga</th>
              <th>Status</th>
              <th>Dipakai</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((service) => {
              const sedangEdit = editId === service.id;
              return (
                <tr key={service.id}>
                  <td>
                    {sedangEdit ? (
                      <input
                        value={editDraf.name}
                        onChange={(event) => setEditDraf({ ...editDraf, name: event.target.value })}
                      />
                    ) : (
                      service.name
                    )}
                  </td>
                  <td>
                    {sedangEdit ? (
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={editDraf.durationMin}
                        onChange={(event) => setEditDraf({ ...editDraf, durationMin: event.target.value })}
                        style={{ width: 90 }}
                      />
                    ) : (
                      `${service.durationMin} mnt`
                    )}
                  </td>
                  <td>
                    {sedangEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={editDraf.price}
                        onChange={(event) => setEditDraf({ ...editDraf, price: event.target.value })}
                        style={{ width: 110 }}
                      />
                    ) : (
                      rupiah(service.price)
                    )}
                  </td>
                  <td>
                    <span className={`badge ${service.active ? 'DONE' : 'CANCELLED'}`}>
                      {service.active ? 'aktif' : 'nonaktif'}
                    </span>
                  </td>
                  <td className="small muted">{service._count?.queues ?? 0} antrian</td>
                  <td>
                    <div className="actions">
                      {sedangEdit ? (
                        <>
                          <button
                            className="primary small"
                            disabled={sibuk || editDraf.name.trim().length < 2}
                            onClick={() =>
                              void jalankan(async () => {
                                const updated = await apiSend<ServiceView>('PATCH', `/services/${service.id}`, {
                                  name: editDraf.name.trim(),
                                  durationMin: Number(editDraf.durationMin || service.durationMin),
                                  price: Number(editDraf.price || 0),
                                });
                                setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                                setEditId(null);
                                setPesan({ tipe: 'ok', teks: `Layanan "${updated.name}" diperbarui.` });
                              })
                            }
                          >
                            Simpan
                          </button>
                          <button className="small" onClick={() => setEditId(null)} disabled={sibuk}>
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="small"
                            disabled={sibuk}
                            onClick={() => {
                              setEditId(service.id);
                              setEditDraf({
                                name: service.name,
                                durationMin: String(service.durationMin),
                                price: String(service.price),
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="small"
                            disabled={sibuk}
                            onClick={() =>
                              void jalankan(async () => {
                                const updated = await apiSend<ServiceView>('PATCH', `/services/${service.id}`, {
                                  active: !service.active,
                                });
                                setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                                setPesan({
                                  tipe: 'ok',
                                  teks: `Layanan "${updated.name}" ${updated.active ? 'diaktifkan' : 'dinonaktifkan'}.`,
                                });
                              })
                            }
                          >
                            {service.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            className="danger small"
                            disabled={sibuk}
                            onClick={() => {
                              if (!window.confirm(`Hapus layanan "${service.name}"?`)) return;
                              void jalankan(async () => {
                                await apiSend('DELETE', `/services/${service.id}`);
                                setRows((prev) => prev.filter((row) => row.id !== service.id));
                                setPesan({ tipe: 'ok', teks: `Layanan "${service.name}" dihapus.` });
                              });
                            }}
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">Belum ada layanan.</p>}
      </div>
    </>
  );
}
