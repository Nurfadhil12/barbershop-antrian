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

# ── Migrasi (RUN_MIGRATIONS=true; butuh CLI migrasi di image) ──
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ -f prisma/schema.prisma ] && [ -x node_modules/.bin/prisma ]; then
    log "menjalankan: prisma migrate deploy"
    node_modules/.bin/prisma migrate deploy
  elif [ -f prisma/schema.prisma ]; then
    log "prisma/schema.prisma ada tapi CLI prisma tidak ada di dependencies."
    log "→ jalankan 'make migrate' (service api-migrate / target migrator) sebelum deploy."
  elif npm run --silent migration:run >/dev/null 2>&1; then
    log "menjalankan: npm run migration:run (TypeORM)"
    npm run migration:run
  elif npm run --silent db:migrate >/dev/null 2>&1; then
    log "menjalankan: npm run db:migrate"
    npm run db:migrate
  else
    log "tidak ada mekanisme migrasi terdeteksi — dilewati"
  fi
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
