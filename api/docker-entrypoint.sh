#!/bin/sh
# api/docker-entrypoint.sh — jalankan migrasi (opsional) lalu start NestJS.
# Dipakai oleh stage "runtime" (lihat api/Dockerfile).
set -eu

log() { printf '[entrypoint] %s\n' "$*"; }

# ── Tunggu database siap (jaring pengaman; compose sudah pakai healthcheck) ──
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

# ── Migrasi database ──
# RUN_MIGRATIONS:
#   auto  (default) = jalankan migrasi kalau Prisma CLI + schema tersedia di image
#   true            = wajib; kalau tool-nya tidak ada, ini dianggap kesalahan konfigurasi
#   false           = jangan pernah jalankan (dipakai jalur compose, yang migrasinya
#                     ditangani service api-migrate terpisah)
#
# Tujuannya: platform seperti Vercel Services tidak punya langkah migrasi terpisah,
# jadi container menyiapkan skemanya sendiri sebelum aplikasi melayani request.
MIGRATE_MODE="${RUN_MIGRATIONS:-auto}"

if [ "$MIGRATE_MODE" = "false" ]; then
  log "migrasi dilewati (RUN_MIGRATIONS=false)"
elif [ -f prisma/schema.prisma ] && [ -x node_modules/.bin/prisma ]; then
  log "menjalankan: prisma migrate deploy"
  attempt=1
  while true; do
    if node_modules/.bin/prisma migrate deploy; then
      break
    fi
    if [ "$attempt" -ge 3 ]; then
      log "ERROR: migrasi gagal setelah ${attempt} percobaan — container dihentikan supaya"
      log "tidak ada aplikasi yang melayani request di atas skema yang salah."
      exit 1
    fi
    log "migrasi gagal (percobaan ${attempt}/3) — coba lagi dalam 5 detik"
    attempt=$((attempt + 1))
    sleep 5
  done
elif [ "$MIGRATE_MODE" = "true" ]; then
  log "ERROR: RUN_MIGRATIONS=true tapi Prisma CLI atau prisma/schema.prisma tidak ada di image."
  exit 1
else
  log "migrasi dilewati (mode auto: Prisma CLI/schema tidak ada di image)"
fi

# ── Start aplikasi ──
if [ "$#" -gt 0 ]; then
  log "start: $*"
  exec "$@"
fi

if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
else
  log "ERROR: dist/main.js tidak ditemukan — apakah 'npm run build' menghasilkan output lain?"
  exit 1
fi
