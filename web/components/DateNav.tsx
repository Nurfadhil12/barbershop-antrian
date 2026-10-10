import Link from 'next/link';
import { hariIni, geserTanggal, tanggalPanjang } from '@/lib/format';

export function DateNav({ date }: { date: string }) {
  const today = hariIni();
  const kemarin = geserTanggal(date, -1);
  const besok = geserTanggal(date, 1);

  return (
    <div className="date-nav">
      <Link className="pill" href={`/?date=${kemarin}`} aria-label="Hari sebelumnya">
        ‹ {kemarin}
      </Link>
      <span className="today">{tanggalPanjang(date)}</span>
      <Link className="pill" href={`/?date=${besok}`} aria-label="Hari berikutnya">
        {besok} ›
      </Link>
      {date !== today && (
        <Link className="pill active" href="/">
          Hari ini
        </Link>
      )}
    </div>
  );
}
