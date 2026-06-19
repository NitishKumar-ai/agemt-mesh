#
# agentmesh:ui -- AgentMesh Operator Console (React/Vite)
#
# Two-stage build:
#   1. builder  -- installs deps and builds the Vite production bundle
#   2. runtime  -- lightweight static file server
#
# Build (from project root):
#   docker build -f docker/ui/Dockerfile -t agentmesh:ui .
#
# Run:
#   docker run -p 5173:5173 agentmesh:ui
#
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifest for layer caching
COPY ./ui/package.json ./

RUN pnpm install --frozen-lockfile

# Copy UI source
COPY ./ui .

# Build the Vite production bundle
RUN pnpm build

# --- Runtime: serve static assets with a lightweight HTTP server ---
FROM node:20-alpine AS runtime

RUN npm install -g serve@latest

WORKDIR /app

COPY --from=builder /app/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
