'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client-api';
import type { BarberView } from '@/lib/types';

export function BarberManager({ barbers }: { barbers: BarberView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<BarberView[]>(barbers);
  const [nama, setNama] = useState('');
  const [telepon, setTelepon] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editTelepon, setEditTelepon] = useState('');
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'error'; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => setRows(barbers), [barbers]);

  const bisaTambah = nama.trim().length >= 2 && !sibuk;

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
            const created = await apiSend<BarberView>('POST', '/barbers', {
              name: nama.trim(),
              ...(telepon.trim() ? { phone: telepon.trim() } : {}),
            });
            setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            setNama('');
            setTelepon('');
            setPesan({ tipe: 'ok', teks: `Kapster "${created.name}" ditambahkan.` });
          });
        }}
      >
        <label className="field">
          Nama kapster *
          <input
            value={nama}
            onChange={(event) => setNama(event.target.value)}
            placeholder="mis. Budi"
            maxLength={80}
            required
          />
        </label>
        <label className="field">
          No. HP (opsional)
          <input
            value={telepon}
            onChange={(event) => setTelepon(event.target.value)}
            placeholder="0812…"
            maxLength={20}
          />
        </label>
        <div>
          <button className="primary" type="submit" disabled={!bisaTambah}>
            Tambah kapster
          </button>
        </div>
      </form>

      <div style={{ overflowX: 'auto', marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>No. HP</th>
              <th>Status</th>
              <th>Antrian ditangani</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((barber) => {
              const sedangEdit = editId === barber.id;
              return (
                <tr key={barber.id}>
                  <td>
                    {sedangEdit ? (
                      <input value={editNama} onChange={(event) => setEditNama(event.target.value)} />
                    ) : (
                      barber.name
                    )}
                  </td>
                  <td>
                    {sedangEdit ? (
                      <input value={editTelepon} onChange={(event) => setEditTelepon(event.target.value)} />
                    ) : (
                      barber.phone || <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${barber.active ? 'DONE' : 'CANCELLED'}`}>
                      {barber.active ? 'aktif' : 'nonaktif'}
                    </span>
                  </td>
                  <td className="small muted">{barber._count?.queues ?? 0} antrian</td>
                  <td>
                    <div className="actions">
                      {sedangEdit ? (
                        <>
                          <button
                            className="primary small"
                            disabled={sibuk || editNama.trim().length < 2}
                            onClick={() =>
                              void jalankan(async () => {
                                const updated = await apiSend<BarberView>('PATCH', `/barbers/${barber.id}`, {
                                  name: editNama.trim(),
                                  phone: editTelepon.trim(),
                                });
                                setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                                setEditId(null);
                                setPesan({ tipe: 'ok', teks: `Kapster "${updated.name}" diperbarui.` });
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
                              setEditId(barber.id);
                              setEditNama(barber.name);
                              setEditTelepon(barber.phone ?? '');
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="small"
                            disabled={sibuk}
                            onClick={() =>
                              void jalankan(async () => {
                                const updated = await apiSend<BarberView>('PATCH', `/barbers/${barber.id}`, {
                                  active: !barber.active,
                                });
                                setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                                setPesan({
                                  tipe: 'ok',
                                  teks: `Kapster "${updated.name}" ${updated.active ? 'diaktifkan' : 'dinonaktifkan'}.`,
                                });
                              })
                            }
                          >
                            {barber.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            className="danger small"
                            disabled={sibuk}
                            onClick={() => {
                              if (!window.confirm(`Hapus kapster "${barber.name}"?`)) return;
                              void jalankan(async () => {
                                await apiSend('DELETE', `/barbers/${barber.id}`);
                                setRows((prev) => prev.filter((row) => row.id !== barber.id));
                                setPesan({ tipe: 'ok', teks: `Kapster "${barber.name}" dihapus.` });
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
        {rows.length === 0 && <p className="empty">Belum ada kapster.</p>}
      </div>
    </>
  );
}
