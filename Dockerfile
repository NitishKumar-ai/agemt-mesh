# ---------------------------------------------------------------------------
# AgentMesh production image (turbo prune strategy)
#
# Uses turbo prune to create a minimal Docker context containing only the
# packages needed by @agentmesh/server-lite. This is the recommended approach
# for CI/CD pipelines.
#
# Build:
#   docker build -t agentmesh:latest .
#
# Run:
#   docker run -p 8080:8080 -v $(pwd)/data:/app/data agentmesh:latest
# ---------------------------------------------------------------------------

# Base image with pnpm
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Stage 1: Prune the monorepo to only necessary packages
FROM base AS pruner
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @agentmesh/server-lite --docker

# Stage 2: Install all dependencies and build
FROM base AS builder
# Copy only the necessary json files for installing dependencies
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Copy the full source code for the necessary packages
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

# Build the target package and its dependencies
RUN pnpm turbo build --filter=@agentmesh/server-lite...

# Stage 3: Production runtime
FROM node:20-slim AS runner
WORKDIR /app

# Install pnpm in the final image
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy built files and dependencies from builder
COPY --from=builder /app .

# Prune dev dependencies for production
RUN pnpm install --prod --frozen-lockfile

# Security: run as non-root
RUN addgroup --gid 1001 agentmesh && adduser --uid 1001 --gid 1001 --disabled-password agentmesh
RUN mkdir -p /app/data && chown -R agentmesh:agentmesh /app/data

USER agentmesh

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:${PORT}/health').then(r=>r.json()).then(d=>{if(d.status!=='OK')process.exit(1)}).catch(()=>process.exit(1))"

# Data directory for SQLite
EXPOSE 8080

# Start the server
CMD ["node", "server-lite/dist/index.js"]
