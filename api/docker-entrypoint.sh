#!/bin/sh
# api/docker-entrypoint.sh — start NestJS, sekaligus (di latar) menyiapkan skema database.
#
# Prinsipnya: JANGAN menahan start aplikasi karena migrasi. Platform seperti Vercel
# memberi tenggang ~15 detik untuk container mengikat $PORT; kalau lewat, SEMUA request
# dijawab FUNCTION_INVOCATION_FAILED — termasuk /api/health, sehingga tidak ada cara
# untuk tahu apa yang salah. Jadi aplikasi start dulu, migrasi menyusul di latar, dan
# statusnya dilaporkan lewat GET /api/health (field "migrate").
set -eu

log() { printf '[entrypoint] %s\n' "$*"; }

STATUS_FILE="${MIGRATE_STATUS_FILE:-/app/logs/migrate-status.json}"

# Tulis status migrasi sebagai JSON (aman untuk kutip/baris baru di pesan error).
write_status() {
  node -e '
    const fs = require("node:fs");
    const [file, status, attempts, error] = process.argv.slice(1);
    fs.writeFileSync(
      file,
      JSON.stringify({
        status,
        attempts: Number(attempts),
        error: error || null,
        updatedAt: new Date().toISOString(),
      }) + "\n",
    );
  ' "$STATUS_FILE" "$1" "$2" "${3:-}" 2>/dev/null || true
}

# ── Tunggu database siap (jaring pengaman; compose sudah pakai healthcheck) ──
# Catatan: jangan set DB_HOST di platform yang punya tenggang waktu start (mis. Vercel),
# karena blok ini bisa menunggu sampai 60 detik.
if [ -n "${DB_HOST:-}" ]; then
  DB_PORT_RESOLVED="${DB_PORT:-5432}"
  tries=0
  while [ "$tries" -lt 30 ]; do
    if node -e "
      const net=require('net');
      const s=net.connect(${DB_PORT_RESOLVED}, process.env.DB_HOST);
      s.setTimeout(2000);
      s.on('connect',()=>{s.end();process.exit(0)});
      s.on('timeout',()=>{s.destroy();process.exit(1)});
      s.on('error',()=>process.exit(1));
    " 2>/dev/null; then
      log "database ${DB_HOST}:${DB_PORT_RESOLVED} siap"
      break
    fi
    tries=$((tries + 1))
    log "menunggu database ${DB_HOST}:${DB_PORT_RESOLVED} (${tries}/30)"
    sleep 2
  done
  if [ "$tries" -ge 30 ]; then
    log "PERINGATAN: database belum merespons — tetap mencoba start aplikasi"
  fi
fi

# ── Jalankan migrasi (di latar) ──
# RUN_MIGRATIONS:
#   auto  (default) = jalankan kalau Prisma CLI + schema ada di image (mode Vercel)
#   true            = wajib; kalau tool-nya tidak ada, itu kesalahan konfigurasi
#   false           = jangan jalankan (jalur compose: migrasi ditangani api-migrate)
run_migrations() {
  attempt=1
  max="${MIGRATE_MAX_ATTEMPTS:-3}"
  while [ "$attempt" -le "$max" ]; do
    if node_modules/.bin/prisma migrate deploy > /tmp/migrate.log 2>&1; then
      tail -n 2 /tmp/migrate.log | sed 's/^/  /'
      write_status done "$attempt"
      log "migrasi selesai (percobaan ${attempt})"
      return 0
    fi
    # Ambil baris terakhir sebagai pesan error — ini yang tampil di /api/health.
    err="$(grep -v '^$' /tmp/migrate.log | tail -n 2 | tr '\n' ' ' | cut -c1-300)"
    write_status failed "$attempt" "${err:-prisma migrate deploy gagal}"
    log "migrasi gagal (percobaan ${attempt}/${max}): ${err}"
    attempt=$((attempt + 1))
    [ "$attempt" -le "$max" ] && sleep 5
  done
  log "PERINGATAN: migrasi gagal setelah ${max} percobaan. Aplikasi tetap melayani,"
  log "tapi request yang butuh tabel akan menjawab 503 (P2021). Lihat /api/health → migrate.error"
  return 1
}

MIGRATE_MODE="${RUN_MIGRATIONS:-auto}"

if [ "$MIGRATE_MODE" = "false" ]; then
  write_status disabled 0 ""
  log "migrasi dilewati (RUN_MIGRATIONS=false)"
elif [ -f prisma/schema.prisma ] && [ -x node_modules/.bin/prisma ]; then
  write_status pending 0 ""
  run_migrations &
  MIGRATE_PID=$!
  waited=0
  # Default kecil (4 detik) dengan sengaja: platform container (Vercel) hanya memberi
  # ~15 detik untuk container mengikat $PORT, dan kegagalan mengikat = SEMUA request
  # dijawab FUNCTION_INVOCATION_FAILED. Lebih baik aplikasi start cepat lalu melayani
  # sebagian request dengan 503 (skema belum siap) daripada tidak bisa diakses sama sekali.
  # Naikkan lewat MIGRATE_WAIT_SECONDS kalau platform-mu tidak punya tenggang waktu.
  wait_max="${MIGRATE_WAIT_SECONDS:-4}"
  while [ "$waited" -lt "$wait_max" ]; do
    kill -0 "$MIGRATE_PID" 2>/dev/null || break
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$MIGRATE_PID" 2>/dev/null; then
    log "migrasi masih berjalan setelah ${waited}s — aplikasi start sekarang, migrasi lanjut di latar"
  fi
elif [ "$MIGRATE_MODE" = "true" ]; then
  write_status failed 0 "PRISMA_CLI_MISSING"
  log "PERINGATAN: RUN_MIGRATIONS=true tapi Prisma CLI/prisma/schema.prisma tidak ada di image."
else
  write_status disabled 0 ""
  log "migrasi dilewati (mode auto: Prisma CLI/schema tidak ada di image)"
fi

# ── Start aplikasi ──
if [ "$#" -gt 0 ]; then
  log "start: $*"
  exec "$@"
fi

if [ -f dist/main.js ]; then
  log "start: node dist/main.js (port ${PORT:-3000})"
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  log "start: node dist/src/main.js (port ${PORT:-3000})"
  exec node dist/src/main.js
else
  log "ERROR: dist/main.js tidak ditemukan — apakah 'npm run build' menghasilkan output lain?"
  exit 1
fi
