# ── Etapa de build ──────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Contexto de workspace completo para respetar el lockfile del monorepo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sync-server/package.json ./packages/sync-server/

RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --filter @vela/sync-server...

COPY packages/sync-server ./packages/sync-server/
RUN pnpm --filter @vela/sync-server build

# ── Etapa de producción ─────────────────
FROM node:22-alpine AS production

WORKDIR /app

# python3/make/g++ necesarios para compilar better-sqlite3 (módulo nativo)
RUN apk add --no-cache python3 make g++

# npm instala solo deps de prod y compila better-sqlite3 en este entorno
COPY packages/sync-server/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/packages/sync-server/dist ./dist

RUN addgroup -g 1001 -S vela && \
    adduser -S vela -u 1001 -G vela && \
    mkdir -p /data && chown vela:vela /data
USER vela

EXPOSE 3001
CMD ["node", "dist/index.js"]
