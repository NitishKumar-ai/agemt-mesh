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

# Prune dev dependencies (optional but recommended for production)
# We do this here because pnpm needs the workspace structure to prune correctly
RUN pnpm install --prod --frozen-lockfile

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create a data directory for SQLite (if still used)
RUN mkdir -p /app/data

EXPOSE 3000

# Start the server
CMD ["node", "server-lite/dist/index.js"]
