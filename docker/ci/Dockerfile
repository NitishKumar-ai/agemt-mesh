FROM node:20-alpine

WORKDIR /workspace/agentmesh

# Install pnpm for the monorepo workspace
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . /workspace/agentmesh

# Install all dependencies, build, test, and lint
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm test
RUN pnpm lint
