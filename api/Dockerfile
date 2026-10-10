# api/Dockerfile — NestJS multi-stage
# Stage: deps -> build -> prod-deps -> runtime (default)   dan   -> migrator (khusus migrasi)
#
# Asumsi struktur repo NestJS standar:
#   api/package.json, api/package-lock.json, api/src/, api/tsconfig.json
#   opsional: api/prisma/schema.prisma  (Prisma) atau api/src/migrations (TypeORM)
#
# PENTING (Prisma): supaya `prisma generate` dan `prisma migrate deploy` jalan di image
# produksi, pindahkan "prisma" dari devDependencies ke dependencies. Kalau tetap di
# devDependencies, migrasi tetap bisa jalan lewat target "migrator" (lihat compose
# service api-migrate / make migrate).
#
# Kalau butuh modul native (bcrypt, sharp, dll): ganti base image ke
# node:${NODE_VERSION}-slim (Debian) dan sesuaikan perintah apk -> apt-get.

ARG NODE_VERSION=24

# ─────────────────────────────── deps ───────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
ARG NODE_VERSION
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
# Schema + config Prisma perlu ada SEBELUM npm ci, karena ada script postinstall
# "prisma generate" (client Prisma 7 di-generate sebagai kode).
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN set -eux; \
    if [ -f package-lock.json ]; then npm ci; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile --ignore-scripts; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    else npm install; fi

# ─────────────────────────────── build ──────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build
ARG NODE_VERSION
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=development
# Prisma 7: `prisma generate` membaca prisma7.config.ts yang mengambil url dari
# DATABASE_URL. Nilai dummy ini hanya untuk tahap build (tidak dipakai runtime);
# tanpa ini generate bisa gagal karena env kosong.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Selalu pastikan folder prisma ada supaya COPY antar-stage tidak gagal saat
# project tidak memakai Prisma (COPY dengan sumber tidak ada = build error).
RUN mkdir -p prisma
# Prisma client harus di-generate sebelum compile
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; \
    else echo "[build] tidak ada prisma/schema.prisma — dilewati"; fi
RUN npm run build
# Normalisasi output: beberapa konfigurasi tsconfig menghasilkan dist/src/main.js.
# Symlink dist/main.js -> dist/src/main.js supaya start command selalu sama.
RUN if [ -f dist/src/main.js ] && [ ! -f dist/main.js ]; then cp -r dist/src/. dist/ ; fi

# ──────────────────── migrator (devDependencies utuh) ───────────────
# Dipakai satu kali untuk migrasi: docker compose --profile tools run --rm api-migrate
FROM build AS migrator
ENV NODE_ENV=production
CMD ["sh", "-c", "if [ -f prisma/schema.prisma ]; then npx prisma migrate deploy; elif npm run --silent migration:run >/dev/null 2>&1; then npm run migration:run; elif npm run --silent db:migrate >/dev/null 2>&1; then npm run db:migrate; else echo '[migrate] tidak ada prisma/schema.prisma maupun script migration:* — dilewati'; fi"]

# ──────────────────── prod-deps (hanya dependencies) ────────────────
# --ignore-scripts penting: script postinstall "prisma generate" butuh Prisma CLI
# yang merupakan devDependency, jadi tidak ada di stage ini. Client Prisma sudah
# di-generate dan ikut ter-compile di stage `build` (masuk ke dist/).
FROM node:${NODE_VERSION}-alpine AS prod-deps
ARG NODE_VERSION
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN set -eux; \
    if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; \
    elif [ -f yarn.lock ]; then yarn install --production --frozen-lockfile --ignore-scripts; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --prod --frozen-lockfile --ignore-scripts; \
    else npm install --omit=dev --ignore-scripts; fi
# Diambil dari stage build (bukan dari context) supaya aman walau api/prisma tidak ada
COPY --from=build /app/prisma ./prisma
# Hanya jalan kalau prisma CLI ada di dependencies (bukan devDependencies)
RUN if [ -x node_modules/.bin/prisma ] && [ -f prisma/schema.prisma ]; then \
      node_modules/.bin/prisma generate; \
    else echo "[prod-deps] prisma CLI tidak ada — jalankan migrasi via target migrator"; fi

# ────────────────────────────── runtime ─────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
ARG NODE_VERSION
RUN apk add --no-cache openssl curl tini
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=UTC

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/logs && chown -R node:node /app

USER node
EXPOSE 3000

# Liveness sederhana tanpa perlu endpoint tambahan: cek port benar-benar listen.
# Kalau sudah punya GET /health (mis. @nestjs/terminus), ganti test di bawah jadi:
#   ["CMD-SHELL", "curl -fsS http://127.0.0.1:3000/health || exit 1"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const s=require('net').connect(Number(process.env.PORT||3000),'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));"

STOPSIGNAL SIGTERM
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
