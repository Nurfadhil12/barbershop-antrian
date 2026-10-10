# Deployment — Next.js + NestJS + PostgreSQL + Nginx

Stack ini menjalankan tiga lapisan di satu VPS memakai Docker Compose:

    Client ──► Nginx (:80 → redirect, :443 TLS)
                 ├── /            ─► web  (Next.js, :3000, standalone)
                 ├── /_next/static ─► web
                 └── /api/        ─► api  (NestJS, :3000) ─► db (PostgreSQL :5432)
    certbot ──► renew sertifikat Let's Encrypt tiap 12 jam (volume terpisah)

Semua service memakai satu network internal (`data-net`) untuk lalu lintas ke database,
dan tidak ada port aplikasi yang dibuka ke internet selain 80/443 (produksi).

---

## 1. Struktur folder yang diasumsikan

    <repo-root>/
      api/                          # source NestJS
        Dockerfile                  # ← dibuat di sini
        .dockerignore
        docker-entrypoint.sh
        package.json, src/, ...
      web/                          # source Next.js
        Dockerfile                  # ← dibuat di sini
        .dockerignore
        package.json, next.config.js, ...
      deployment/                   # semua berkas deployment
        docker-compose.yml          # base: db, api, web, nginx, certbot
        docker-compose.prod.yml     # override produksi (limit resource, port DB ditutup)
        .env.example                # template environment
        Makefile                    # pintasan perintah
        nginx/Dockerfile            # nginx + config sendiri
        nginx/nginx.conf
        nginx/templates/app.conf.template   # server block (envsubst: ${DOMAIN})
        postgres/init/01-init.sql   # ekstensi & schema, jalan sekali saat initdb
        scripts/init-letsencrypt.sh
        scripts/backup-db.sh
        scripts/restore-db.sh
        scripts/deploy.sh

Prinsip penting: **semua perintah dijalankan dari folder `deployment/`**, dan
`docker compose` otomatis membaca `deployment/.env` (karena file compose ada di folder itu).

---

## 2. Prasyarat yang harus dipenuhi kode aplikasi

Backend (NestJS)
- `api/package.json` punya script `build` yang menghasilkan `dist/main.js`
  (default NestJS: `"build": "nest build"`).
- Kalau port di-set dari env, pakai `process.env.PORT` (compose mengirim `PORT=3000`).
- Migrasi: pakai Prisma (`prisma/schema.prisma`) **atau** script npm
  `migration:run` / `db:migrate` (TypeORM). Entrypoint mendeteksinya otomatis.
- Prisma: pindahkan `prisma` dari `devDependencies` ke `dependencies` supaya
  `prisma migrate deploy` bisa jalan di image runtime. Kalau tidak, migrasi tetap
  bisa lewat service `api-migrate` (target `migrator`) — lihat bagian 7.
- Kalau memakai modul native bermasalah di musl (bcrypt, sharp, dsb.), ganti base
  image di `api/Dockerfile` dari `node:24-alpine` ke `node:24-slim` dan ubah
  `apk add` menjadi `apt-get install`.

Frontend (Next.js)
- **Wajib** `output: 'standalone'` di `web/next.config.js`:

      /** @type {import('next').NextConfig} */
      const nextConfig = {
        output: 'standalone',
        // kalau frontend memanggil API di domain yang sama, ini cukup:
        // env NEXT_PUBLIC_API_URL dikirim sebagai build-arg oleh compose
      };
      module.exports = nextConfig;

- `NEXT_PUBLIC_*` **dibakar saat build**. Default di sini `NEXT_PUBLIC_API_URL=/api`
  (relatif, karena semua trafik lewat Nginx di domain yang sama). Mengubah nilainya
  butuh build ulang, bukan sekadar restart.
- Untuk data fetching di server (RSC/SSR), pakai `INTERNAL_API_URL=http://api:3000`
  (sudah disuntik oleh compose) supaya tidak keluar-masuk Nginx.
- Next.js static export (`output: 'export'`)? Image ini tidak berlaku — build lalu
  serve folder `out/` langsung dari Nginx.

---

## 3. Deploy pertama kali di VPS

    # 1) Prasyarat di VPS (Ubuntu/Debian)
    sudo apt update && sudo apt install -y docker.io docker-compose-plugin git make
    sudo usermod -aG docker "$USER" && newgrp docker

    # 2) Clone repo & masuk folder deployment
    git clone <repo-url> /srv/app && cd /srv/app/deployment

    # 3) Siapkan environment
    cp .env.example .env
    nano .env        # WAJIB: DOMAIN, LETSENCRYPT_EMAIL, POSTGRES_PASSWORD

    # 4) DNS: arahkan A record (dan AAAA bila ada) ke IP VPS, tunggu propagasi
    dig +short example.com

    # 5) Sertifikat TLS (buat dummy → minta sertifikat)
    ./scripts/init-letsencrypt.sh          # LETSENCRYPT_STAGING=1 dulu (default)

    # 6) Nyalakan semuanya (mode produksi)
    ./scripts/deploy.sh --build            # atau: make prod-up

    # 7) Kalau sudah normal, pindah ke sertifikat produksi
    LETSENCRYPT_STAGING=0 ./scripts/init-letsencrypt.sh

Firewall (hanya buka 22/80/443):

    sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

Cek hasil: `https://<DOMAIN>` (frontend), `https://<DOMAIN>/api/...` (backend),
`docker compose -f docker-compose.yml -f docker-compose.prod.yml ps`.

---

## 4. Alur harian (Makefile)

Jalankan dari `deployment/`: `make help` untuk daftar lengkap.

| Perintah | Fungsi |
|---|---|
| `make up` / `make down` | nyalakan / matikan stack (dev/staging, DB terbuka di 127.0.0.1) |
| `make prod-up` / `make prod-down` | stack produksi (limit resource, port DB ditutup) |
| `make logs` / `logs-api` / `logs-web` / `logs-db` | ikuti log |
| `make ps` | status container |
| `make check` | validasi `docker-compose.yml` + override (tanpa menjalankan apa pun) |
| `make deploy` | deploy penuh: git pull → image → migrasi → up → verifikasi |
| `make migrate` | migrasi database (Prisma) satu kali — otomatis juga saat `up` |
| `make seed` | isi data contoh (5 layanan, 3 kapster, antrian contoh hari ini) |
| `make backup` / `make restore FILE=backups/x.dump` | backup / restore PostgreSQL |
| `make psql` / `make shell-db` | masuk ke database |
| `make certs` / `certs-prod` / `certs-renew` | sertifikat TLS |
| `make clean` | **hapus** stack + volume (data hilang) |

Environment lokal untuk sekadar mengembangkan backend:

    make up            # atau: docker compose -f docker-compose.yml up -d db
    # Postgres tersedia di 127.0.0.1:5432 (hanya loopback), lalu jalankan
    # `npm run start:dev` di api/ seperti biasa.

---

## 5. Update & rollback

    cd /srv/app/deployment
    ./scripts/deploy.sh              # pull kode + tarik image + migrasi + restart
    ./scripts/deploy.sh --build      # kalau build image di VPS, bukan dari registry

Rollback cepat:

1. `git checkout <commit-lama>` lalu `./scripts/deploy.sh --no-pull --build`, **atau**
2. pin tag image: set `API_IMAGE=<registry>/api:tag-lama` di `.env`, lalu
   `docker compose ... up -d api` (butuh registry).
3. Migrasi database **tidak** otomatis di-rollback. Simpan backup sebelum migrasi
   destruktif (`make backup`) dan siapkan script `down` di migrasi.

Sebelum deploy, `deployment/.env` dipakai apa adanya — tidak ada secret yang
tersimpan di repo (`.env` di-`.gitignore`).

---

## 6. Backup & restore database

    make backup                                  # → deployment/backups/<db>_<tanggal>.dump
    make restore FILE=backups/portfolio_2026-10-10_023000.dump

- Format custom `pg_dump -Fc -Z 6`, retensi `BACKUP_RETENTION_DAYS` (default 14).
- Cron di host (jam 02:30 tiap hari):

      30 2 * * * cd /srv/app/deployment && ./scripts/backup-db.sh >> /var/log/portfolio-backup.log 2>&1

- Backup disimpan di dalam volume/bind-mount VPS. Untuk ketahanan nyata, sinkronkan
  `deployment/backups/` ke object storage, mis.:

      rclone sync /srv/app/deployment/backups remote:portfolio-backups

- `postgres/init/*.sql` hanya dijalankan saat volume `pgdata` masih kosong. Untuk
  menerapkan ulang: `make clean` (data hilang) lalu `make prod-up`.

---

## 7. Migrasi database

Service `api-migrate` **selalu dijalankan sebelum `api` start**
(`depends_on: condition: service_completed_successfully`), jadi `docker compose up -d`
tidak pernah menyalakan aplikasi di atas skema lama. Service itu memakai target build
`migrator` yang masih membawa devDependencies (Prisma CLI), sementara image runtime
`api` hanya berisi dependencies produksi.

Kenapa `RUN_MIGRATIONS=false` (default di `.env.example`): image runtime tidak punya
Prisma CLI, jadi entrypoint tidak bisa menjalankan `prisma migrate deploy`. Kalau kamu
ingin migrasi dijalankan oleh proses API sendiri (aplikasi kecil), pindahkan `prisma`
ke `dependencies` (bukan `devDependencies`) lalu set `RUN_MIGRATIONS=true`.

Tiga jalur:

1. **Otomatis** — `docker compose up -d` / `./scripts/deploy.sh` (default). Kegagalan
   migrasi membatalkan start `api`, jadi tidak ada aplikasi setengah jalan.
2. **Manual** — `make migrate` (atau `docker compose run --rm api-migrate`) setelah
   menambah migrasi baru sementara stack sudah jalan.
3. **Dari CI** — `docker compose run --rm api-migrate` setelah image baru ter-push;
   lihat `deployment/.github/workflows/deploy.yml`.

Untuk mengembangkan migrasi: `cd api && npx prisma migrate dev --name <nama>` (butuh
`DATABASE_URL` yang bisa dijangkau dari host).

---

## 8. Variabel lingkungan penting (`deployment/.env`)

| Variabel | Arti |
|---|---|
| `DOMAIN` | domain publik tanpa protokol; juga dipakai untuk nama file sertifikat |
| `LETSENCRYPT_EMAIL`, `LETSENCRYPT_STAGING` | registrasi & mode sertifikat (1 = staging) |
| `POSTGRES_USER/PASSWORD/DB/PORT` | kredensial database. Password dipakai juga di `DATABASE_URL` → URL-encode karakter spesial |
| `POSTGRES_SHARED_BUFFERS` dll. | tuning PostgreSQL; sesuaikan dengan RAM VPS (mis. RAM 2 GB → shared_buffers 512MB, effective_cache_size 1GB) |
| `RUN_MIGRATIONS`, `LOG_LEVEL`, `CORS_ORIGIN` | perilaku backend. `RUN_MIGRATIONS=true` hanya berguna kalau `prisma` dipindah ke `dependencies` (image runtime punya CLI-nya) |
| `SHOP_TIMEZONE` | zona waktu toko untuk menentukan "hari ini" pada nomor antrian (default `Asia/Jakarta`) |
| `NEXT_PUBLIC_API_URL` | build-arg frontend (default `/api`) |
| `API_IMAGE`, `WEB_IMAGE`, `NGINX_IMAGE`, `API_MIGRATE_IMAGE` | nama/tag image — pakai tag registry untuk deploy berbasis image |
| `HTTP_PORT`, `HTTPS_PORT`, `NGINX_CLIENT_MAX_BODY_SIZE` | Nginx (ubah `HTTP_PORT` kalau 80 dipakai proses lain) |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` | backup |
| `*_CPU_LIMIT`, `*_MEM_LIMIT`, `*_MEM_RESERVATION` | limit resource produksi (dipakai `docker-compose.prod.yml`) |

`POSTGRES_PASSWORD` sengaja memakai `${...:?}` di compose → kalau kosong, perintah
compose langsung gagal dengan pesan jelas (bukan container yang diam-diam salah).

---

## 9. Troubleshooting

**Nginx tidak mau start** — sertifikat belum ada. Jalankan
`./scripts/init-letsencrypt.sh` (script itu membuat sertifikat dummy lebih dulu).
Cek langsung: `docker compose exec nginx nginx -t`.

**Build web gagal: `.next/standalone` tidak ada** — tambahkan `output: 'standalone'`
di `web/next.config.js`.

**404 semua di `/api/...`** — Nginx meneruskan path apa adanya (tanpa memotong `/api`).
Kalau NestJS-mu **tidak** memakai `app.setGlobalPrefix('api')`, ubah di
`nginx/templates/app.conf.template`:

    location /api/ {
        proxy_pass http://api_upstream/;   # perhatikan garis miring di akhir

Lalu `docker compose exec nginx nginx -s reload`.

**502 Bad Gateway dari Nginx** — backend belum siap atau crash. Lihat
`make logs-api`; pastikan `DATABASE_URL` benar dan migrasi sukses.

**Prisma: "Query engine binary not found" / migrate tidak jalan** — `prisma` masih di
`devDependencies`, atau target build salah (musl vs glibc). Solusi: pindahkan ke
`dependencies`, atau jalankan migrasi lewat `make migrate`, atau ganti base image ke
`node:24-slim` (Debian) di `api/Dockerfile`.

**Perubahan `NEXT_PUBLIC_API_URL` tidak berefek** — variabel itu dibakar saat build.
Butuh `make build` / `./scripts/deploy.sh --build`.

**Letsencrypt error "too many certificates"** — `LETSENCRYPT_STAGING=1` untuk uji coba;
rate limit produksi ketat (5 sertifikat duplikat/minggu).

**Port 80 sudah dipakai** — `sudo ss -ltnp | grep :80`; set `HTTP_PORT=8080` di `.env`
(hanya untuk uji coba — Let's Encrypt butuh port 80 dari internet).

**Port container tidak bisa diakses dari host (`docker inspect` → `NetworkSettings.Ports`
kosong, `docker compose config` terlihat benar)** — ini terjadi kalau service-nya berada di
network dengan `internal: true`: Docker **tidak** mem-publish port container di network
internal, dan tidak memberi error. Compose di repo ini karena itu memakai `data-net` sebagai
bridge biasa (lihat komentar di `docker-compose.yml`); port database tetap ditutup di produksi
lewat `docker-compose.prod.yml` (`ports: !reset []`).

**Database "password authentication failed"** — `POSTGRES_PASSWORD` diubah setelah
volume `pgdata` dibuat; password lama masih tersimpan di dalam volume. Untuk reset:
`make clean` (data hilang) atau ubah manual dengan `ALTER USER`.

**Cek cepat kesehatan sistem**

    cd deployment
    docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
    curl -sk https://$DOMAIN/healthz          # nginx
    curl -s  https://$DOMAIN/api/health       # API + status database

### Masalah khusus TypeScript 6 / Prisma 7 (versi yang dipakai aplikasi ini)

**Build api gagal: `error TS5011 … rootDir` atau `TS5101 Option 'baseUrl' is deprecated`** —
TypeScript 6 mewajibkan `rootDir` eksplisit dan menolak `baseUrl`. Perbaikannya ada di
`api/tsconfig.json` (`"rootDir": "./src"`, tanpa `baseUrl`). Jangan tambahkan
`ignoreDeprecations` untuk menutupinya.

**Prisma 7: `The datasource property 'url' is no longer supported`** — sejak Prisma 7 URL
tidak lagi di `schema.prisma`. URL migrasi ada di `api/prisma7.config.ts`, sedangkan runtime
memakai driver adapter (`@prisma/adapter-pg`) di `api/src/prisma/prisma.service.ts`. Jangan
kembalikan `url = env("DATABASE_URL")` ke schema.

**`prisma generate` gagal waktu build image** — generate membaca `prisma7.config.ts` yang
mengambil `DATABASE_URL`. Dockerfile stage `build` sudah menyuntik `DATABASE_URL` dummy; kalau
kamu menghapusnya, build akan gagal dengan pesan koneksi.

**Jangan `npx prisma init` di dalam repo** — CLI Prisma 7 juga menulis folder
`.claude/`, `.windsurf/`, `.agents/` dan `skills-lock.json`. Repo ini sudah punya
`schema.prisma` + `prisma7.config.ts`; cukup edit yang ada.

**Drift detected saat `prisma migrate dev`** — ada tabel di database yang tidak ada di
`schema.prisma`. Repo ini menghindarinya dengan tidak membuat tabel apa pun di
`postgres/init/01-init.sql` (hanya ekstensi); semua tabel dimiliki migrasi Prisma.

---

## 10. CI (opsional)

`deployment/.github/workflows/deploy.yml` membangun & mem-push image `api`/`web` ke
GHCR, lalu deploy ke VPS via SSH. Supaya aktif, pindahkan ke root repo:

    mkdir -p .github/workflows
    mv deployment/.github/workflows/deploy.yml .github/workflows/deploy.yml

Secret yang dibutuhkan di GitHub: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `DEPLOY_PATH`
(contoh `/srv/app`). Image GHCR memakai `GITHUB_TOKEN` bawaan — tidak perlu secret
tambahan, tapi package GHCR default **privat**, jadi login sekali di VPS:

    echo "$PAT" | docker login ghcr.io -u <username> --password-stdin

…atau ubah visibility package menjadi public di halaman package GitHub.

---

## 11. Hasil verifikasi berkas ini

Sudah diuji nyata (Docker 28.3.2 / Compose v2.39.1 di macOS):

- `docker compose config` bersih untuk base **dan** override produksi; `ports: !reset []`
  benar-benar menutup port Postgres di override (terkonfirmasi dari config hasil resolusi).
- Image Nginx dibangun, template ter-render lewat envsubst (`DOMAIN=example.com`,
  `client_max_body_size 25m`), `nginx -t` sukses, container jalan dan:
  `/healthz` → 200, `/` → 301 ke HTTPS, TLS handshake OK, `/api/...`, `/_next/static/...`,
  dan `/` semuanya diteruskan ke upstream yang benar (502 karena upstream uji kosong).
- PostgreSQL 17: healthcheck `pg_isready` → healthy; `postgres/init/01-init.sql`
  benar-benar jalan (ekstensi `uuid-ossp`, `pgcrypto`, `citext`, `pg_trgm`, `unaccent`
  terpasang; schema `app` dan tabel `_deployment_init` ada).
- `api/docker-entrypoint.sh` diuji di `node:24-alpine` (busybox sh): start normal OK,
  jalur "tidak ada mekanisme migrasi" OK, dan loop tunggu database OK
  (berhasil mendeteksi Postgres yang siap).
- Image `certbot/certbot:v5.8.0` punya OpenSSL 3.5.8 dan perintah pembuatan sertifikat
  dummy di `init-letsencrypt.sh` berhasil dijalankan di dalamnya.
- Semua script lolos `bash -n`; target Makefile valid (`make help`, `make check`).

**Belum bisa diverifikasi di sini** (butuh domain nyata):

- Penerbitan sertifikat Let's Encrypt asli (butuh domain yang sudah menunjuk ke VPS).
  Jalur domain lokal (`DOMAIN=localhost`) sudah diuji dan berhasil membuat sertifikat self-signed.
- Limit CPU/memori (`deploy.resources`) dan perilaku reboot VPS.

Sudah diuji setelah aplikasi antrian barbershop ada di repo ini:

- Build image `api` (runtime 780MB), `api` target `migrator` (807MB), `web` (303MB),
  `nginx` (93MB) — semua sukses.
- `./scripts/init-letsencrypt.sh` dijalankan sungguhan (DOMAIN=localhost): membuat
  self-signed cert, menyalakan nginx, dan ikut menyalakan dependensinya.
- Stack penuh (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`):
  `api-migrate` exit 0 sebelum `api` start, semua container `healthy`.
- Lewat Nginx: `/healthz` → 200, `/` → 301 ke HTTPS, `/api/health` → `{status: ok, db: up}`,
  header HSTS/nosniff/frame/referrer terkirim, dan halaman `/` merender data dari database
  (SSR) — bukan placeholder.
- `api/scripts/smoke-api.sh` dijalankan menembus Nginx (`BASE=https://localhost/api`):
  **76 PASS, 0 FAIL** (CRUD layanan/kapster, lifecycle antrian WAITING→IN_PROGRESS→DONE,
  pembatalan, validasi, kode error 400/404/409).
- Jalur migrasi pada database **kosong**: `api-migrate` membuat `services`, `barbers`,
  `queues`, `_prisma_migrations` dari nol.
- UI diuji di browser sungguhan: buat antrian dari form (dapat `A-006`), tombol Panggil
  terkunci + petunjuk "Pilih kapster dulu" saat kapster belum dipilih, Panggil → status
  "Dilayani", Selesai → "Selesai", CRUD layanan (tambah → nonaktifkan → hapus), CRUD kapster.

