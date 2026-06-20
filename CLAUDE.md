# CLAUDE.md — AgentMesh

Instructions for AI coding agents working on the AgentMesh monorepo.

## Project Overview

AgentMesh is pivoting from a pure workflow orchestration engine into a **"company brain"**: a permission-aware, temporal memory graph that ingests internal sources (docs, Slack, email, calendar, GitHub PRs) and serves deduplicated, cited answers to humans and AI agents. The original orchestration engine is retained as the durable execution substrate underneath the new memory/ingestion pipelines.

It consists of:

- **Backend**: NestJS REST API + SQLite persistence (server-lite on port 3000/8080)
- **Memory graph**: `graph-service` — NestJS service backed by Neo4j (in-memory fallback), bitemporal fact storage, entity correction loop
- **Retrieval/answer layer**: `workflow-service` — `TrustWorkflowService`, confidence calibration, citation validation, abstention-on-contradiction
- **Knowledge OS**: `company-knowledge-os/` — separate pnpm/turbo workspace defining `Fact`/`Episode`/`Entity` Zod models and the `Connector` interface for source ingestion (Slack/email/Gdrive/calendar/PRs) — connectors are not yet implemented
- **Frontends**: 
  - `ui/` — Agent Mesh OS (React 19 + Vite + Tauri 2 desktop app)
  - `ui-next/` — Conductor UI (React 18 + MUI + React Router, legacy)
- **Agent runtime**: In-process agent execution with LLM providers (Anthropic, Gemini)

## Key Source Locations

| Content | Where to look |
|---------|---------------|
| REST API controllers | `rest/src/controllers/*.ts` (NestJS `@Controller`) |
| Orchestration API | `rest/src/controllers/OrchestrationController.ts` (`/api/orchestration/*`) |
| Temporal fact graph | `graph-service/src/` — `GraphService.ingestNode()`, `ingestFact()`, `getFactsCurrent()`, `getFactsAsOf()`, `applyCorrection()` |
| Company-brain retrieval workflows | `workflow-service/src/` — `TrustWorkflowService`, `retrieveAndAnswer()` |
| Knowledge models + connectors | `company-knowledge-os/packages/*` — `Fact`/`Episode`/`Entity` schemas, `Connector` interface (stub only) |
| Vector store / Hyper DAO interfaces | `common-persistence/src/interfaces/` — `VectorStoreDAO`, `HyperDAO` (interfaces only, no implementation yet) |
| Agent Mesh OS frontend | `ui/src/` (React 19, custom CSS, lucide icons) |
| Conductor UI frontend | `ui-next/src/` (React 18, MUI v7, React Router v7) |
| API client (ui) | `ui/src/lib/api.ts` (Agent API) + `ui/src/lib/conductorApi.ts` (orchestration) |
| Server entry point | `server-lite/src/index.ts` (NestJS bootstrap) |
| Storage interfaces | `common-persistence/src/` |
| Domain models | `common/src/models/` (Zod schemas) |
| Storage implementations | `sqlite-persistence/`, `postgres-persistence/`, `cassandra-persistence/`, etc. |
| Workflow engine (execution substrate) | `core/src/execution/` |
| Agent runtime | `agent-runtime/src/` |
| Chaos tests | `chaos-suite/chaos.test.ts` (crash-recovery test) |

## Company-Brain Build Status

What exists vs. what's missing for the memory-graph pivot (see `graph-service`, `workflow-service`, `company-knowledge-os`):

- **Done**: bitemporal fact graph, fact supersession, human correction/entity-merge loop, confidence-calibrated retrieval workflows, citation validation, abstention on contradiction.
- **Missing**: real source connectors (Slack/email/Gdrive/calendar/GitHub PR ingestion is unimplemented), vector/embedding search (`VectorStoreDAO` has no backing implementation), permission enforcement (only a `permissions_hash` field exists, no policy engine), cross-source deduplication/entity-resolution beyond manual correction.
- **Build order**: (1) one real connector end-to-end, (2) wire `VectorStoreDAO` to a vector store, (3) permission evaluation in `graph-service` query paths, (4) automated dedup/entity-resolution orchestrator.

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

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
