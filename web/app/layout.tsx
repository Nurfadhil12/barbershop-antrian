import type { Metadata } from 'next';
import Link from 'next/link';
import { NavLink } from '@/components/NavLink';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antrian Barbershop',
  description: 'Papan antrian, layanan, dan kapster barbershop',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              ✂️ Antrian <span>Barbershop</span>
            </div>
            <nav className="nav">
              <NavLink href="/">Papan Antrian</NavLink>
              <NavLink href="/layanan">Layanan</NavLink>
              <NavLink href="/barber">Kapster</NavLink>
              <NavLink href="/riwayat">Riwayat</NavLink>
            </nav>
            <div style={{ marginLeft: 'auto' }} className="small muted">
              <Link href="/api/health" prefetch={false}>
                status API
              </Link>
            </div>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
