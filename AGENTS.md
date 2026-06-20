# AGENTS.md

Instructions for AI coding agents working on the AgentMesh codebase.

## Project Overview

AgentMesh is pivoting from a pure workflow orchestration engine into a **company brain**: a permission-aware, temporal memory graph that ingests internal sources (docs, Slack, email, calendar, GitHub PRs), deduplicates them, and serves cited, confidence-calibrated answers to humans and AI agents. The durable orchestration engine (`core`, `common-persistence`, `*-persistence`) is retained as the execution substrate beneath the new memory/ingestion pipelines (`graph-service`, `workflow-service`, `company-knowledge-os`).

It is a TypeScript monorepo managed by `pnpm` with 38+ workspace packages. Note: `company-knowledge-os/` is its own nested pnpm/turbo workspace, not part of the root `pnpm-workspace.yaml`.

## Setup Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build the entire project (37+ packages) |
| `pnpm test` | Run all unit tests (contract tests need Docker) |
| `pnpm --filter <pkg> test` | Test a single package |
| `pnpm lint` | Run linting checks |

## Code Style

- Use **interface-based approach** for all pluggable components
- Core interfaces go in `@agentmesh/common` (domain) or `@agentmesh/common-persistence` (DAOs)
- Storage interfaces go in `@agentmesh/common-storage` (ExternalPayloadStorage, FileStorage)
- Follow existing patterns in the codebase for consistency
- Do not use emojis in code, logs, or comments
- When adding new logic, comment the algorithm/design decisions
- Avoid mocks in tests — use real implementations when possible

## Architecture Guidelines

### Module Structure

| Layer | Packages | Purpose |
|-------|----------|---------|
| **Domain** | `common` | Zod schemas, enums, types for Task, Workflow, WorkflowDef |
| **Interfaces** | `common-persistence` | DAO interfaces: ExecutionDAO, MetadataDAO, QueueDAO, etc. |
| **Interfaces** | `common-storage` | FileStorage, ExternalPayloadStorage interfaces |
| **Engine** | `core` | Workflow execution, system tasks, sweeper, decider |
| **Memory graph** | `graph-service` | Bitemporal temporal fact graph (Neo4j + in-memory fallback), entity correction loop |
| **Retrieval** | `workflow-service` | `TrustWorkflowService` — confidence-calibrated retrieval workflows, citation validation, abstention on contradiction |
| **Knowledge OS** | `company-knowledge-os` | Separate workspace: `Fact`/`Episode`/`Entity` Zod models, `Connector` interface (Slack/email/Gdrive/calendar/PR — unimplemented stubs) |
| **Agents** | `agent-runtime` | Agent worker pool, tool registry, LLM integration |
| **AI** | `ai` | LLM providers (Anthropic, Gemini), model routing |
| **REST API** | `rest` | NestJS controllers + services, Swagger |
| **Server** | `server-lite` | NestJS bootstrap, SQLite + sync adapter |
| **Persistence** | `*-persistence` | DAO implementations (sqlite, postgres, mysql, redis, cassandra, kafka, nats) |
| **Queue** | `amqp-queue` | Pure AMQP QueueDAO (no DB delegate) |
| **Queue** | `amqp` | Hybrid AMQP QueueDAO (delegates to DB for state) |
| **Storage** | `*-storage` | ExternalPayloadStorage + FileStorage impls (gcs, local, postgres) |
| **Proto** | `annotations` | @ProtoMessage/@ProtoField decorators |
| **Proto** | `annotations-processor` | Protogen code generator (class-based models) |
| **Proto** | `zod-proto-gen` | Zod-to-proto generator (scaffolded) |
| **Frontend** | `ui` | Agent Mesh OS — React 19 + Vite + Tauri 2 + custom CSS |
| **Frontend** | `ui-next` | Conductor UI — React 18 + MUI v7 + React Router v7 |
| **Testing** | `chaos-suite` | Crash-recovery integration test (SIGKILL + restart) |

### Key Patterns

- **DAOs**: Interfaces in `common-persistence`, implementations in `*-persistence` packages. Each impl must implement the full interface.
- **QueueDAO**: 18 methods. Hard methods (setUnackTimeout, postpone, etc.) use in-memory unack registry + background sweeper in non-DB implementations (Kafka, NATS, AMQP).
- **System tasks**: Registered in `SystemTaskRegistry`. The `SyncSqliteAdapter` has a `pop()` method that wraps `popMessage()` for batch draining.
- **Storage**: `ExternalPayloadStorage` for transparent JSON payload offloading; `FileStorage` for user-facing binary files.
- **Configuration**: Environment variables (see `.env.example`).

### Orchestration API (`/api/orchestration/*`)

Added as a Conductor-compatible REST API layer. Endpoints:

| Endpoint | Methods |
|----------|---------|
| `/api/orchestration/metadata/workflow` | GET (list), POST, PUT, DELETE |
| `/api/orchestration/metadata/taskdef` | GET (list), POST, PUT, DELETE |
| `/api/orchestration/workflow/search` | GET (search executions) |
| `/api/orchestration/workflow/:id` | GET, DELETE |
| `/api/orchestration/workflow/:id/tasks` | GET |
| `/api/orchestration/tasks/search` | GET (task search) |
| `/api/orchestration/tasks/queue/all` | GET (queue monitoring) |
| `/api/orchestration/eventhandler` | GET (list), POST, DELETE |
| `/api/orchestration/scheduler` | GET (list), POST, DELETE (in-memory storage) |
| `/api/orchestration/schema` | GET (list), GET (stub) |
| `/api/orchestration/eventqueues` | GET |

## Testing

- **Use Vitest** for unit and integration tests
- **Contract tests** live in `common-persistence/test/` — run via Docker-based integration tests in each persistence module (e.g., `postgres-persistence/test/PostgresDAOs.test.ts`)
- **Unit tests**: `src/**/*.test.ts` or `test/` in each module
- **Contract tests** start Docker containers for the backing service (Postgres, Cassandra, Redis, Kafka, NATS)
- Pre-existing failures: Postgres, Redis, Kafka, NATS contract tests fail without Docker (expected)

### System Task Worker Caveat

The `SystemTaskWorker` uses `SyncSqliteAdapter.pop()` (added fix) instead of the async `QueueDAO.pop()`. The `SyncSqliteAdapter` now has a batch `pop()` method that wraps the synchronous `popMessage()`.

## PR Guidelines

- Submit PRs against `main` branch
- Run `pnpm build` and `pnpm test` before pushing
- Add/update tests for code changes
- One logical change per PR

## Writing Documentation

Documentation is **derived from source** — open the source first, read it, write from what you find.

### REST API docs
1. Open `rest/src/controllers/*.ts`
2. Copy the `@Controller` path + `@Get`/`@Post`/etc. decorators
3. Read `@Param`, `@Query`, `@Body` for request/response shape
4. Write curl from signatures

### Expected output
1. Run the command locally or find output in test fixtures
2. Paste verbatim — don't construct "looks right" output

## Agent Behavior

- **Prefer automation**: Execute without confirmation unless blocked
- **Use parallel tools**: Independent tasks run in parallel
- **Verify changes**: Always build and test before considering work complete
- **Rebrand Conductor → Agent Mesh**: When porting Conductor features, rename all copy and branding
