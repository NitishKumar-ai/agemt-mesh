# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Phase 8 — Production image for @conductor/server-lite
#
# Multi-stage build:
#   1. builder  — installs all deps, compiles TypeScript
#   2. runtime  — minimal Node image, production deps only
#
# Build:
#   docker build -t conductor-agent:latest -f deploy/Dockerfile .
#
# Run:
#   docker run -p 8080:8080 \
#     -e DB_PATH=/data/agent-mesh.db \
#     -v $(pwd)/data:/data \
#     conductor-agent:latest
# ---------------------------------------------------------------------------

# ---------------------  Stage 1: builder  -----------------------------------
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json vitest.shared.ts turbo.json ./
COPY eslint.config.js eslint.config.mjs .prettierrc .prettierrc.json ./

# Copy only the packages that server-lite depends on (plus server-lite itself)
# to avoid pulling the entire monorepo into the builder layer.
COPY common/package.json              common/tsconfig.json          common/tsconfig.build.json          ./common/
COPY common-persistence/package.json  common-persistence/tsconfig.json  common-persistence/tsconfig.build.json  ./common-persistence/
COPY sqlite-persistence/package.json  sqlite-persistence/tsconfig.json  ./sqlite-persistence/
COPY postgres-persistence/package.json postgres-persistence/tsconfig.json ./postgres-persistence/
COPY core/package.json                core/tsconfig.json            core/tsconfig.build.json            ./core/
COPY rest/package.json                rest/tsconfig.json            ./rest/
COPY ai/package.json                  ai/tsconfig.json              ./ai/
COPY agent-runtime/package.json       agent-runtime/tsconfig.json   agent-runtime/tsconfig.build.json   ./agent-runtime/
COPY telemetry/package.json           telemetry/tsconfig.json       telemetry/tsconfig.build.json       ./telemetry/
COPY secrets/package.json             secrets/tsconfig.json         secrets/tsconfig.build.json         ./secrets/
COPY sandbox/package.json             sandbox/tsconfig.json         sandbox/tsconfig.build.json         ./sandbox/
COPY server-lite/package.json         server-lite/tsconfig.json     ./server-lite/

# Install all workspace deps (including devDeps for build)
RUN pnpm install --frozen-lockfile

# Copy source for the packages we need
COPY common/src           ./common/src
COPY common/test          ./common/test
COPY common-persistence/src  ./common-persistence/src
COPY sqlite-persistence/src  ./sqlite-persistence/src
COPY postgres-persistence/src ./postgres-persistence/src
COPY core/src             ./core/src
COPY core/test            ./core/test
COPY rest/src             ./rest/src
COPY ai/src               ./ai/src
COPY agent-runtime/src    ./agent-runtime/src
COPY telemetry/src        ./telemetry/src
COPY secrets/src          ./secrets/src
COPY sandbox/src          ./sandbox/src
COPY server-lite/src      ./server-lite/src

# Build (turbo respects dependency order)
RUN pnpm turbo run build --filter=@conductor/server-lite...

# ---------------------  Stage 2: runtime  -----------------------------------
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -g 1001 conductor && adduser -u 1001 -G conductor -s /bin/sh -D conductor

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace skeleton (needed by pnpm to resolve workspaces)
COPY --from=builder /build/package.json             ./package.json
COPY --from=builder /build/pnpm-workspace.yaml      ./pnpm-workspace.yaml
COPY --from=builder /build/pnpm-lock.yaml           ./pnpm-lock.yaml

# Copy compiled packages
COPY --from=builder /build/common/dist              ./common/dist
COPY --from=builder /build/common/package.json      ./common/package.json
COPY --from=builder /build/common-persistence/dist  ./common-persistence/dist
COPY --from=builder /build/common-persistence/package.json  ./common-persistence/package.json
COPY --from=builder /build/sqlite-persistence/dist  ./sqlite-persistence/dist
COPY --from=builder /build/sqlite-persistence/package.json  ./sqlite-persistence/package.json
COPY --from=builder /build/postgres-persistence/dist ./postgres-persistence/dist
COPY --from=builder /build/postgres-persistence/package.json ./postgres-persistence/package.json
COPY --from=builder /build/core/dist                ./core/dist
COPY --from=builder /build/core/package.json        ./core/package.json
COPY --from=builder /build/rest/dist                ./rest/dist
COPY --from=builder /build/rest/package.json        ./rest/package.json
COPY --from=builder /build/ai/dist                  ./ai/dist
COPY --from=builder /build/ai/package.json          ./ai/package.json
COPY --from=builder /build/agent-runtime/dist       ./agent-runtime/dist
COPY --from=builder /build/agent-runtime/package.json  ./agent-runtime/package.json
COPY --from=builder /build/telemetry/dist           ./telemetry/dist
COPY --from=builder /build/telemetry/package.json   ./telemetry/package.json
COPY --from=builder /build/secrets/dist             ./secrets/dist
COPY --from=builder /build/secrets/package.json     ./secrets/package.json
COPY --from=builder /build/sandbox/dist             ./sandbox/dist
COPY --from=builder /build/sandbox/package.json     ./sandbox/package.json
COPY --from=builder /build/server-lite/dist         ./server-lite/dist
COPY --from=builder /build/server-lite/package.json ./server-lite/package.json

# Production deps only
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Data directory (SQLite DB lives here by default)
RUN mkdir -p /data && chown conductor:conductor /data

# Drop to non-root
USER conductor

# Health check: poll our own /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8080}/health | grep -q '"status":"UP"' || exit 1

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/agent-mesh.db

EXPOSE 8080

ENTRYPOINT ["node", "/app/server-lite/dist/index.js"]
