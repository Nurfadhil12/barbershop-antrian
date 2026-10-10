'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client-api';
import type { BarberView, QueueView, ServiceView } from '@/lib/types';

export function AddQueueForm({
  services,
  barbers,
}: {
  services: ServiceView[];
  barbers: BarberView[];
}) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ? String(services[0].id) : '');
  const [barberId, setBarberId] = useState<string>('');
  const [note, setNote] = useState('');
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'error'; teks: string } | null>(null);
  const [sedangKirim, setSedangKirim] = useState(false);

  /** Satu aturan, satu tempat: apakah form boleh dikirim. */
  const bisaKirim = customerName.trim().length >= 2 && serviceId !== '' && !sedangKirim;

  async function kirim(event: React.FormEvent) {
    event.preventDefault();
    if (!bisaKirim) return;
    setSedangKirim(true);
    setPesan(null);
    try {
      const created = await apiSend<QueueView>('POST', '/queues', {
        customerName: customerName.trim(),
        ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        serviceId: Number(serviceId),
        ...(barberId ? { barberId: Number(barberId) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setPesan({
        tipe: 'ok',
        teks: `Antrian ${created.code} untuk ${created.customerName} dibuat (${created.service.name}).`,
      });
      setCustomerName('');
      setCustomerPhone('');
      setNote('');
      setBarberId('');
      router.refresh();
    } catch (error) {
      setPesan({ tipe: 'error', teks: (error as Error).message });
    } finally {
      setSedangKirim(false);
    }
  }

  return (
    <form className="inline" onSubmit={kirim}>
      <label className="field">
        Nama pelanggan *
        <input
          name="customerName"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
          placeholder="mis. Andi"
          maxLength={80}
          required
        />
      </label>

      <label className="field">
        No. HP (opsional)
        <input
          name="customerPhone"
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="0812…"
          maxLength={20}
        />
      </label>

      <label className="field">
        Layanan *
        <select
          name="serviceId"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        >
          {services.length === 0 && <option value="">tidak ada layanan aktif</option>}
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {service.durationMin} mnt
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Kapster (opsional)
        <select name="barberId" value={barberId} onChange={(event) => setBarberId(event.target.value)}>
          <option value="">belum ditentukan</option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>
              {barber.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Catatan (opsional)
        <input
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="mis. model fade"
          maxLength={200}
        />
      </label>

      <div>
        <button className="primary" type="submit" disabled={!bisaKirim}>
          {sedangKirim ? 'Menyimpan…' : 'Ambil nomor antrian'}
        </button>
      </div>

      {pesan && (
        <div className={`alert ${pesan.tipe === 'ok' ? 'success' : 'error'}`} style={{ gridColumn: '1 / -1' }}>
          {pesan.teks}
        </div>
      )}
    </form>
  );
}
