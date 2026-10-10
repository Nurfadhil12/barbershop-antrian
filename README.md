# Antrian Barbershop — Next.js + NestJS + PostgreSQL

Aplikasi CRUD antrian untuk barbershop: kasir mengambil nomor antrian pelanggan, memanggil
("Panggil"), menandai selesai, membatalkan, plus pengelolaan **layanan** dan **kapster** serta
**riwayat** per tanggal.

    Browser ──► Nginx ──┬── /            ──► web  (Next.js 16, App Router, SSR)
                         └── /api/...     ──► api  (NestJS 12 + Prisma 7) ──► PostgreSQL 17

## Struktur repo

    api/          backend NestJS + Prisma (schema, migrasi, seed, smoke test)
    web/          frontend Next.js (papan antrian, layanan, kapster, riwayat)
    deployment/   docker compose, Nginx + TLS, script deploy/backup, Makefile  → lihat deployment/README.md

## Fitur

**Papan antrian (halaman utama)**
- Nomor antrian **direset setiap hari** (`A-001`, `A-002`, …) memakai zona waktu toko (`SHOP_TIMEZONE`).
- Ringkasan: total, menunggu, dilayani, selesai, dibatalkan, rata-rata durasi layanan.
- Banner "sedang dilayani" + siapa yang berikutnya.
- Form ambil nomor: nama (wajib), no. HP, layanan (wajib), kapster (opsional), catatan.
- Tombol per baris: **Panggil** (WAITING → IN_PROGRESS), **Selesai** (IN_PROGRESS → DONE),
  **Batal** (WAITING/IN_PROGRESS → CANCELLED), **Hapus** (koreksi salah input).
- Navigasi tanggal (lihat antrian hari lain) + auto-refresh opsional tiap 20 detik.

**Layanan** (`/layanan`) — CRUD nama, durasi (5–480 menit), harga, aktif/nonaktif.
**Kapster** (`/barber`) — CRUD nama, no. HP, aktif/nonaktif.
**Riwayat** (`/riwayat`) — filter per tanggal, status, dan pencarian nama/kode/no. HP; menghitung
nilai layanan yang selesai.

## Aturan bisnis (ditegakkan di API, dicerminkan di UI)

| Aturan | Perilaku |
|---|---|
| Nomor urut per hari | `number = max(hari itu) + 1`, dijaga `pg_advisory_xact_lock` supaya dua kasir tidak dapat nomor sama |
| Panggil tanpa kapster | 400 "Pilih kapster dulu…" — otomatis kalau hanya ada **satu** kapster aktif |
| Satu kapster satu antrian | 409 kalau kapster itu masih melayani antrian lain |
| Ubah data antrian | hanya boleh saat status WAITING (409 kalau sudah dipanggil/selesai) |
| Selesai | hanya dari IN_PROGRESS (409 kalau belum dipanggil) |
| Batal | hanya WAITING/IN_PROGRESS (409 kalau sudah DONE/CANCELLED) |
| Hapus layanan/kapster | 409 kalau sudah dipakai antrian — nonaktifkan saja (riwayat tetap utuh) |
| Nama layanan/kapster | unik (409 kalau duplikat), minimal 2 karakter |

## Menjalankan di lokal (development)

    # 1) Database (hanya service db, port 15432 di host)
    cd deployment && cp .env.example .env && POSTGRES_PORT=15432 docker compose -f docker-compose.yml up -d db

    # 2) Backend
    cd ../api && cp .env.example .env          # DATABASE_URL sudah menunjuk 127.0.0.1:15432
    npm install
    npx prisma migrate deploy                  # atau: npx prisma migrate dev
    npx prisma generate                        # client Prisma 7 -> src/generated/prisma
    npm run seed                               # 5 layanan, 3 kapster, contoh antrian
    npm run build && node dist/main.js         # API di http://localhost:3210/api

    # 3) Frontend (terminal lain)
    cd web && npm install && npm run dev       # http://localhost:3000
    # /api diteruskan ke 127.0.0.1:3210 lewat rewrites di web/next.config.js
    # (ubah API_PROXY_TARGET kalau port API-mu beda)

Uji API (butuh state hasil seed):

    cd api && ./scripts/smoke-api.sh           # 76 asersi: health, CRUD, lifecycle, validasi, filter

## Menjalankan versi produksi (Docker)

    cd deployment
    cp .env.example .env            # isi DOMAIN, LETSENCRYPT_EMAIL, POSTGRES_PASSWORD
    ./scripts/init-letsencrypt.sh   # sertifikat TLS (self-signed untuk localhost)
    ./scripts/deploy.sh --build     # build image + migrasi + up + verifikasi
    # atau: make prod-up  lalu  make seed  (sekali saja, untuk data contoh)

Detail lengkap (DNS, firewall, backup, rollback, CI): **deployment/README.md**.

### Port yang bisa diakses dari host

| Alamat | Isi | Catatan |
|---|---|---|
| `https://localhost` (443) | aplikasi lewat Nginx | pakai jalur ini untuk meniru produksi; sertifikat self-signed → browser minta konfirmasi |
| `http://localhost:3000` | frontend langsung (Next.js) | tanpa peringatan sertifikat — paling nyaman untuk melihat tampilan; `/api` diteruskan oleh server Next ke container api |
| `http://localhost` (80) | redirect ke 443 + jalur ACME | |
| `3000`, `5432` (container) | api & postgres | tidak dibuka ke host; akses lewat `make psql` / `make logs-api` |

Port 3000 hanya di-bind ke `127.0.0.1` (`WEB_PORT` di `.env`), jadi tidak terbuka ke
internet walaupun dijalankan di VPS.

## Deploy ke Vercel (frontend + API + Neon, tanpa Docker)

Vercel sekarang mendukung **NestJS tanpa konfigurasi** dan punya **Services** (beta, tersedia di
semua plan) untuk menjalankan beberapa service dalam satu project — jadi seluruh stack ini bisa
di-deploy dari satu repo, tanpa Nginx/Certbot/Compose. Pemetaannya:

| Di repo ini | Di Vercel |
|---|---|
| `web/` (Next.js) | service `web` (root `web/`) |
| `api/` (NestJS) | service `api` (root `api/`) |
| `deployment/docker-compose.yml` service `db` | database Postgres dari Marketplace (`vercel install neon`) |
| `deployment/nginx` (routing + TLS) | `rewrites` di `vercel.json` + TLS otomatis Vercel |
| `deployment/scripts/init-letsencrypt.sh` | tidak diperlukan |
| volume `pgdata` | database Neon |
| `api-migrate` (service one-shot) | tidak ada padanannya → migrasi dijalankan dari Mac/CI |

Berkas yang sudah disiapkan untuk jalur ini:

- `vercel.json` (root) — `services` {web, api}, `rewrites` `/api/(.*)` → api dan sisanya → web,
  serta binding yang mengisi `INTERNAL_API_URL` di service web (dipakai `web/lib/api.ts` untuk SSR).
- `api/package.json` → script `vercel-build` = `prisma generate && nest build`
  (client Prisma 7 di-generate sebagai kode, jadi wajib ada di build Vercel).
- `api/src/common/database-url.ts` → resolver toleran: `DATABASE_URL` → `POSTGRES_PRISMA_URL` →
  `POSTGRES_URL` (integrasi Neon bisa menyuntik nama yang berbeda).
- `api/src/prisma/prisma.service.ts` → memakai `pg.Pool` + `attachDatabasePool` dari
  `@vercel/functions` (pola yang direkomendasikan Neon untuk Fluid compute: koneksi idle ditutup
  rapi sebelum function disuspend) lalu pool itu diserahkan ke `PrismaPg`.

Langkah deploy (butuh akun Vercel/GitHub — tidak bisa diotomatiskan dari repo):

    # 1) Repo ini di GitHub, lalu di Vercel: Add New → Project → import repo tersebut.
    #    Vercel membaca vercel.json dan membuat dua service (web + api) dalam satu project.

    # 2) Pasang Postgres:
    vercel install neon            # atau lewat Marketplace di dashboard
    #    Integrasi ini menyuntik DATABASE_URL (pooled) ke project.

    # 3) Environment variables (dashboard → Settings → Environment Variables):
    #    service api : SHOP_TIMEZONE=Asia/Jakarta, RUN_MIGRATIONS=false, LOG_LEVEL=info
    #    service web : NEXT_PUBLIC_API_URL=/api          (build-time)
    #    INTERNAL_API_URL JANGAN diisi manual — itu diisi otomatis oleh binding.
    #    CORS tidak perlu: browser memanggil /api di domain yang sama, Vercel me-route ke service api.

    # 4) Migrasi (sekali, sebelum request pertama) — pakai koneksi langsung/unpooled Neon:
    cd api
    DATABASE_URL="<neon-direct-url>" npx prisma migrate deploy
    DATABASE_URL="<neon-direct-url>" npm run seed        # opsional: data contoh

    # 5) Deploy: push ke branch utama → produksi; pull request → preview deploy.

Yang perlu diketahui sebelum pindah penuh:

- **Services masih beta.** Kalau ada kendala, alternatifnya: dua project Vercel terpisah
  (Root Directory `web/` dan `api/`) dengan `NEXT_PUBLIC_API_URL` absolut + `CORS_ORIGIN` di API.
- **Tidak ada `depends_on`** di Vercel: service start bersamaan tanpa urutan. Karena itu migrasi
  dijalankan terpisah (langkah 4) — jangan bergantung pada `RUN_MIGRATIONS`.
- **Tidak ada container stateful**: Postgres harus dari Marketplace, bukan container sendiri.
- Folder `deployment/` tetap ada dan tetap dipakai untuk jalur VPS; Vercel mengabaikannya.
  Workflow di `deployment/.github/workflows/deploy.yml` juga tidak jalan di GitHub (GitHub hanya
  membaca `.github/workflows` di root repo) — pindahkan dulu kalau ingin CI deploy VPS.
- `.env` tidak dipakai Vercel; semua environment lewat dashboard/integrasi.
- Function Hobby: durasi maksimum 300s, cron harian. Cold start masih ada (Fluid compute).

### Migrasi database di Vercel

Container api menyiapkan skemanya **sendiri saat start** — jadi tidak ada langkah manual:

- `RUN_MIGRATIONS` tidak di-set (atau `auto`) → `prisma migrate deploy` dijalankan sebelum aplikasi
  melayani request. Ini mode yang dipakai di Vercel.
- `RUN_MIGRATIONS=true` → wajib jalan; kalau Prisma CLI/schema tidak ada di image, container berhenti
  dengan pesan jelas (lebih baik daripada melayani request di atas skema yang salah).
- `RUN_MIGRATIONS=false` → dilewati. Ini yang dipakai jalur Docker Compose, karena migrasinya
  ditangani service `api-migrate` terpisah.

⚠️ Kalau di Vercel environment variable `RUN_MIGRATIONS` bernilai `false`, migrasi otomatis itu mati —
hapus variabelnya atau ubah jadi `true`.

Kalau migrasi gagal, container mencoba 3× (jeda 5 detik) lalu berhenti supaya tidak ada aplikasi yang
melayani request di atas skema yang salah.

Jalur manual (kalau perlu, mis. dari Mac dengan URL langsung Neon):

```bash
cd api
DATABASE_URL="postgresql://…@ep-xxx.…neon.tech/neondb?sslmode=require" npx prisma migrate deploy
DATABASE_URL="…" npm run seed   # opsional: data contoh
```

### Kalau deploy Vercel gagal

**`FUNCTION_INVOCATION_FAILED` / "A server error has occurred" pada SEMUA endpoint api**
(termasuk `/api/ping` yang tidak menyentuh database) = proses function crash, bukan error aplikasi.
Pada Prisma 7 penyebab yang sudah terbukti adalah pembundelan: client Prisma 7 memuat
**query compiler WASM** (`@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs`)
lewat `require` dinamis saat runtime, dan bundler function Vercel (@vercel/node) tidak membawanya
serta. Gejalanya identik dengan masalah database (500 pada semua endpoint), padahal bukan.

Solusi yang dipakai repo ini: jalankan service `api` sebagai **container**, bukan runtime Node
terdeteksi:

```json
"api": { "root": "api/", "runtime": "container", "entrypoint": "Dockerfile" }
```

Yang dibangun adalah image Docker yang sama dengan jalur VPS (`api/Dockerfile`), jadi tidak ada
bundler yang menyentuh `node_modules`. Konsekuensinya build pertama lebih lama, dan aplikasi harus
mendengarkan `$PORT` (Vercel mengirim `PORT`, default 80 — `api/src/main.ts` sudah membacanya).

**`Multiple frameworks detected in project root: Next.js, Container. Specify "framework" explicitly in services.`**
Vercel mendeteksi `Dockerfile` di dalam `api/` sebagai framework "Container" yang bersaing dengan
Next.js milik `web/`. Kalau service api dijalankan sebagai Node (bukan container), tulis `framework`
eksplisit per service — slug yang sah antara lain `"nextjs"`, `"nestjs"`, `"container"`.

**Build sukses tapi deploy tetap tidak jalan sebagai dua service**
Vercel hanya membangun model Services kalau **dua** syarat terpenuhi: (1) `vercel.json` memuat key
`services`, dan (2) Framework Preset project di dashboard diset ke **Services**
(Settings → Build and Deployment → Framework Preset). Kalau salah satu tidak terpenuhi, Vercel
jatuh kembali ke deteksi framework biasa dan mengabaikan `services`.

**Error terkait Prisma Client tidak ditemukan saat build**
Client Prisma 7 di-generate sebagai kode TypeScript, jadi harus ada saat build. Repo ini memakai
dua lapis pengaman: script `postinstall` (`prisma generate`) sehingga ikut jalan setiap
`npm install`, dan `build` = `prisma generate && nest build`. `api/prisma7.config.ts` memakai URL
placeholder kalau `DATABASE_URL` belum ada, supaya `generate` tidak gagal (perintah yang benar-benar
menyambung ke database tetap butuh URL asli).

**Cara memisahkan masalah database vs masalah aplikasi di Vercel**
Buka `/api/ping` (tidak menyentuh database) dan `/api/health` (menyentuh database):

| `/api/ping` | `/api/health` | Artinya |
|---|---|---|
| 200 | `db: "up"` | sehat |
| 200 | `db: "down"` + `dbSource`/`dbHost`/`error` | aplikasi sehat, `DATABASE_URL` salah/belum diset → perbaiki lalu `prisma migrate deploy` |
| crash / 500 juga | — | bukan database: masalah boot/bundling → pakai `runtime: "container"` |

`/api/health` juga memetakan error koneksi: `P1001` → 503 "Database tidak bisa dijangkau",
`P1000` → "Kredensial database ditolak", `P1017` → "Koneksi ditutup server, coba lagi".

Catatan kejujuran: jalur Vercel ini sudah disiapkan dan diverifikasi secara lokal (build
`vercel-build`, pool adapter terhadap PostgreSQL nyata, `vercel.json` valid), tetapi **belum diuji
deploy ke Vercel** karena butuh akun Vercel kamu.

## Kontrak API

Semua respons JSON; error memakai `{ statusCode, message, error }` (message bisa array untuk error validasi).
Prefix `/api` (NestJS `setGlobalPrefix('api')`).

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/health` | status API + koneksi database |
| GET | `/api/services?activeOnly=true` | daftar layanan (+ jumlah antrian) |
| POST | `/api/services` | buat layanan `{ name, durationMin?, price?, active? }` |
| PATCH | `/api/services/:id` | ubah sebagian |
| DELETE | `/api/services/:id` | hapus (409 kalau sudah dipakai) |
| GET | `/api/barbers?activeOnly=true` | daftar kapster |
| POST/PATCH/DELETE | `/api/barbers[/:id]` | idem untuk kapster |
| GET | `/api/queues?date=&status=&q=&serviceId=&barberId=` | daftar antrian + ringkasan hari itu |
| GET | `/api/queues/summary?date=` | ringkasan saja |
| POST | `/api/queues` | ambil nomor `{ customerName, serviceId, barberId?, customerPhone?, note?, queueDate? }` |
| PATCH | `/api/queues/:id` | ubah data (hanya saat WAITING) |
| POST | `/api/queues/:id/start` | panggil `{ barberId? }` |
| POST | `/api/queues/:id/finish` | tandai selesai |
| POST | `/api/queues/:id/cancel` | batalkan |
| DELETE | `/api/queues/:id` | hapus permanen |

## Model data (Prisma)

    Service  id, name (unik), durationMin, price, active, createdAt
    Barber   id, name (unik), phone?, active, createdAt
    Queue    id, number, code, queueDate (date-only), customerName, customerPhone?, status,
             note?, serviceId → Service, barberId → Barber?, createdAt, startedAt?, finishedAt?
             @@unique([queueDate, number])   @@index([queueDate, status])

`QueueStatus` = `WAITING | IN_PROGRESS | DONE | CANCELLED`.

## Catatan versi & keputusan teknis

- **Prisma 7** mengubah arsitektur: URL koneksi tidak lagi di `schema.prisma`, melainkan di
  `api/prisma7.config.ts` (untuk CLI/migrasi), dan runtime memakai driver adapter
  `@prisma/adapter-pg` (lihat `api/src/prisma/prisma.service.ts`). Client di-generate sebagai kode
  TypeScript ke `api/src/generated/prisma` (di-`.gitignore`) — jadi **wajib** `npx prisma generate`
  setelah `npm install` dan sebelum build.
- `prisma` CLI dipin ke **7.10.0** agar sama dengan `@prisma/client`; dist-tag `latest` paket
  `prisma` saat ini menunjuk ke release candidate 8.0.0-rc.
- **TypeScript 6** menolak `baseUrl` dan mewajibkan `rootDir` eksplisit → lihat `api/tsconfig.json`.
- **Next.js 16** memakai `output: 'standalone'` (wajib untuk `web/Dockerfile`) dan
  `turbopack.root` supaya tidak salah mendeteksi workspace root.
- Migrasi tidak dijalankan oleh proses API di produksi (`RUN_MIGRATIONS=false`): service
  `api-migrate` di compose menjalankannya sebelum `api` start (`service_completed_successfully`),
  sehingga `docker compose up -d` selalu berjalan di atas skema terbaru.
- Semua halaman memakai data segar (`export const dynamic = 'force-dynamic'`, `cache: 'no-store'`)
  karena papan antrian harus selalu real-time.
