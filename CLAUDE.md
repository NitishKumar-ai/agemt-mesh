# CLAUDE.md — AgentMesh

Instructions for AI coding agents working on the AgentMesh monorepo.

## Project Overview

AgentMesh is a TypeScript monorepo (pnpm workspaces) implementing a durable workflow orchestration engine. It consists of:

- **Backend**: NestJS REST API + SQLite persistence (server-lite on port 3000/8080)
- **Frontends**: 
  - `ui/` — Agent Mesh OS (React 19 + Vite + Tauri 2 desktop app)
  - `ui-next/` — Conductor UI (React 18 + MUI + React Router, legacy)
- **Agent runtime**: In-process agent execution with LLM providers (Anthropic, Gemini)

## Key Source Locations

| Content | Where to look |
|---------|---------------|
| REST API controllers | `rest/src/controllers/*.ts` (NestJS `@Controller`) |
| Orchestration API | `rest/src/controllers/OrchestrationController.ts` (`/api/orchestration/*`) |
| Agent Mesh OS frontend | `ui/src/` (React 19, custom CSS, lucide icons) |
| Conductor UI frontend | `ui-next/src/` (React 18, MUI v7, React Router v7) |
| API client (ui) | `ui/src/lib/api.ts` (Agent API) + `ui/src/lib/conductorApi.ts` (orchestration) |
| Server entry point | `server-lite/src/index.ts` (NestJS bootstrap) |
| Storage interfaces | `common-persistence/src/` |
| Domain models | `common/src/models/` (Zod schemas) |
| Storage implementations | `sqlite-persistence/`, `postgres-persistence/`, `cassandra-persistence/`, etc. |
| Workflow engine | `core/src/execution/` |
| Agent runtime | `agent-runtime/src/` |
| Chaos tests | `chaos-suite/chaos.test.ts` (crash-recovery test) |

## Build & Test Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all 37+ workspace packages |
| `pnpm test` | Run all unit tests (contract tests need Docker) |
| `pnpm --filter <pkg> test` | Test a single package |
| `pnpm lint` | Lint all packages |
| `cd ui && pnpm dev` | Start frontend dev server (port 5173) |
| `node server-lite/dist/index.js` | Start backend (port 3000, or `PORT=8080`) |

## Architecture Decisions

- **Storage backends**: DAO interfaces in `common-persistence`, impls in `*-persistence` packages
- **Storage backends (files)**: `ExternalPayloadStorage` + `FileStorage` interfaces in `common-storage`, impls in `*-storage` packages
- **Protobuf**: `@agentmesh/annotations` decorators + `annotations-processor` for class-based models; `zod-proto-gen` (scaffolded) for Zod-based models
- **Queues**: `QueueDAO` interface with 7+ implementations (SQLite, Postgres, Redis, Kafka, NATS, AMQP, Cassandra)
- **Frontend routing**: Legacy Agent Mesh pages use `useState<PageKey>`; new Conductor pages use `react-router-dom` under `/workflows`, `/tasks`, `/events`, `/schedulers`

## Writing Documentation

Documentation is **derived from source**, not composed from memory. Open the source first, read it, then write.

### Workflow for each content type

**REST API endpoint or curl example**
1. Open the controller: `rest/src/controllers/` — TypeScript NestJS `@Controller('api/...')`
2. Copy the path from the decorator literally.
3. Read `@Get`, `@Post`, `@Param`, `@Query`, `@Body` for the signature.
4. Write the curl from what you just read.

**Expected output block**
1. Get real output: run the command locally, or find it in test fixtures or CI logs.
2. Paste verbatim. Do not construct output that "looks right."

## Modifying the CLAUDE.md

This file should be kept in sync with the actual project structure. When adding major new packages or changing the architecture, update the source locations and commands above.

See [AGENTS.md](AGENTS.md) for full project conventions.
