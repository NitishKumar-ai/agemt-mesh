# AgentMesh Docker Builds

## Quick Start

```bash
# Start with Postgres + Redis (recommended for production)
docker compose -f docker/docker-compose.yaml up -d --build

# Start with SQLite only (simplest, good for development)
docker build -t agentmesh:server -f docker/server/Dockerfile .
docker run -p 8080:8080 -v $(pwd)/data:/data agentmesh:server
```

## Pre-built Docker Images

### Server Only (API)

[docker/server/Dockerfile](server/Dockerfile) -- AgentMesh server with NestJS API.

```bash
docker build -t agentmesh:server -f docker/server/Dockerfile .
```

### Server + UI

[docker/server/Dockerfile.next](server/Dockerfile.next) -- AgentMesh server with the
React Operator Console bundled. The NestJS server serves both the API and the UI
from a single process.

```bash
docker build -t agentmesh:server-next -f docker/server/Dockerfile.next .
```

### UI Only (Development)

[docker/ui/Dockerfile](ui/Dockerfile) -- Standalone React UI for development.

```bash
docker build -f docker/ui/Dockerfile -t agentmesh:ui .
docker run -p 5173:5173 agentmesh:ui
```

## Configuration

AgentMesh is configured entirely via environment variables. No property files needed.

See [server/config/README.md](server/config/README.md) for the full reference, or
`.env.example` in the project root.

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `DB_PATH` | `./data/agentmesh.sqlite` | SQLite database path |
| `DB_TYPE` | `sqlite` | Database backend: `sqlite` or `postgres` |
| `ANTHROPIC_API_KEY` | -- | Anthropic Claude API key |
| `GEMINI_API_KEY` | -- | Google Gemini API key |

### Database Backends

| Backend | Status | Configuration |
|---------|--------|---------------|
| SQLite | Default | Set `DB_PATH` |
| PostgreSQL | Supported | Set `DB_TYPE=postgres` + `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` |

## Docker Compose Variants

### Active Stacks

| Compose File | Description |
|--------------|-------------|
| [docker-compose.yaml](docker-compose.yaml) | Postgres + Redis (recommended) |
| [docker-compose-postgres.yaml](docker-compose-postgres.yaml) | Postgres only |
| [docker-compose-postgres-e2e.yaml](docker-compose-postgres-e2e.yaml) | E2E test stack |
| [docker-compose-ui-e2e.yaml](docker-compose-ui-e2e.yaml) | UI E2E test stack |

### Utilities

| Compose File | Description |
|--------------|-------------|
| [docker-compose-port-override.yaml](docker-compose-port-override.yaml) | Override the default port mapping |

### Deprecated (Not Supported in TypeScript Rewrite)

The following compose files reference backends that are not yet available in the
TypeScript rewrite. They contain deprecation notices:

- `docker-compose-mysql.yaml`
- `docker-compose-cassandra-es7.yaml`
- `docker-compose-es8.yaml`
- `docker-compose-redis-os.yaml` / `redis-os2.yaml` / `redis-os3.yaml`

## Health Check

The server exposes a health endpoint:

```bash
curl http://localhost:8080/health
# {"status":"OK","version":"0.1.0.0","uptime":42}
```

## CI Docker Image

[docker/ci/Dockerfile](ci/Dockerfile) runs the full CI pipeline (install, build,
test, lint) inside a container:

```bash
docker build -f docker/ci/Dockerfile .
```
