# AGENTS.md

Canonical instructions for AI coding agents working on AgentMesh.

## Product Direction

AgentMesh is a company-brain platform built on top of a durable workflow engine. It ingests company sources, stores permission-aware temporal facts in a graph, deduplicates entities, retrieves supporting evidence, and serves cited answers and first-party workflows.

The retained orchestration substrate lives in `core`, `common-persistence`, `rest`, `server-lite`, queue packages, and persistence packages. The company-brain layer primarily lives in:

- `graph-service`: Neo4j/in-memory temporal graph, corrections, permissions, vector search, entity resolution.
- `workflow-service`: permission-safe trust workflows, citations, confidence scoring, abstention, NL query API.
- `company-knowledge-os`: separate nested pnpm/turbo workspace for connector, episode, extraction, and ingestion packages.
- `knowledge-os`: root-workspace connector package; do not confuse it with the nested workspace.
- `ui`: primary React 19 Agent Mesh UI.

Read [`passes.md`](passes.md) for the current production-readiness roadmap and [`pivot.md`](pivot.md) for the product requirements and completed capability slices.

## Current State

Verified completed slices:

- Vector/embedding search: pgvector, HNSW, hosted/local providers, permission filtering, reindexing, and evaluation.
- Neo4j production graph path: tenant-scoped persisted temporal reads and correction primitives.
- Cross-source entity resolution: exact, alias, and fuzzy matching with automatic merge and reassignment.
- Graph/workflow permission enforcement: source visibility, fail-closed unknown ACLs, trusted `request.user`, admin-gated graph writes, and disabled arbitrary HTTP Cypher.

Do not reopen these as “missing” without source evidence.

Current priorities:

1. Production OAuth/OIDC and durable authorization.
2. Repair and consolidate the nested `company-knowledge-os` workspace.
3. Real connector ingestion and ACL synchronization.
4. Queue/scheduler recovery and persistence.
5. Retrieval calibration and the operations dashboard.

Important distinction: graph-level authorization is implemented, but production identity verification, durable grants, directory/group synchronization, and connector ACL ingestion are not.

## Workspace Layout

The root is a pnpm/turbo TypeScript monorepo. `company-knowledge-os/` is a second, nested pnpm/turbo workspace and is not included in the root `pnpm-workspace.yaml`.

| Layer | Main packages | Responsibility |
| --- | --- | --- |
| Domain | `common` | Zod models, enums, workflow/task types, vector-search contracts |
| Persistence interfaces | `common-persistence` | Execution, metadata, queue, and other DAO interfaces |
| Storage interfaces | `common-storage` | `ExternalPayloadStorage`, `FileStorage` |
| Engine | `core` | Workflow execution, decider, system tasks, sweeper |
| Graph and search | `graph-service` | Temporal facts, Neo4j, corrections, entity resolution, policy enforcement, vector retrieval |
| Trust workflows | `workflow-service` | Cited workflows, NL query, abstention, confidence |
| Nested Knowledge OS | `company-knowledge-os` | Connectors, database, extraction, ingestion; currently does not compile |
| Root connector package | `knowledge-os` | Connector interfaces and current root-workspace connector code |
| REST | `rest` | NestJS orchestration/task/metadata APIs |
| Server | `server-lite` | NestJS bootstrap, SQLite wiring, workers, runtime scheduler |
| Agent runtime | `agent-runtime` | Agents, tools, workers, LLM execution |
| AI | `ai` | Anthropic/Gemini providers and model routing |
| Primary frontend | `ui` | React 19 + Vite + Tauri |
| Legacy frontend | `ui-next` | React 18 + MUI; port only features still needed |
| Resilience | `chaos-suite` | Crash/restart integration coverage |

## Architecture Rules

- Use interfaces for pluggable components.
- Put domain contracts in `common`, persistence contracts in `common-persistence`, and file/payload storage contracts in `common-storage`.
- Keep tenant scoping in datastore queries, not only in controller filtering.
- Unknown source ACL state must fail closed.
- HTTP identity comes only from verified middleware-populated `request.user`. Never trust body, query, or ad hoc identity headers.
- Human users, tenant administrators, and connector/service identities require separate authorization policies.
- Do not expose arbitrary Cypher through tenant HTTP APIs.
- Corrections and entity merges must keep graph state and vector indexes synchronized.
- Connector ingestion must persist source ACL metadata before facts become retrievable.
- Avoid incompatible duplicate schemas between `graph-service` and `company-knowledge-os`; establish one owner for each persisted concept.
- Do not use emojis in code, logs, or comments.
- Comment algorithmic or security-sensitive decisions, not obvious syntax.
- Prefer real implementations in tests; use mocks only for narrow boundaries.

## Commands

Use `pnpm.cmd` in Windows PowerShell when `pnpm.ps1` is blocked.

| Command | Purpose |
| --- | --- |
| `pnpm.cmd build` | Build the 31 root workspace package tasks |
| `pnpm.cmd test` | Run root tests; Docker-backed contracts may fail when services are absent |
| `pnpm.cmd turbo run test --filter=!@agentmesh/nats --filter=!@agentmesh/kafka` | Broad local regression without the known Docker-dependent Kafka/NATS suites |
| `pnpm.cmd --filter @agentmesh/graph-service test` | Graph, vector, policy, correction, and entity tests |
| `pnpm.cmd --filter @agentmesh/workflow-service test` | Trust workflow and policy tests |
| `pnpm.cmd --filter @agentmesh/server-lite test` | Server and end-to-end tests |
| `pnpm.cmd --filter <package> build` | Focused package build |
| `pnpm.cmd --filter <package> lint` | Focused package lint |
| `pnpm.cmd exec turbo run build` from `company-knowledge-os/` | Build the nested workspace; currently fails in `@company-knowledge-os/database` |

After a root frontend build, check `ui/dist/index.html`. The tracked asset hash may be regenerated even when no UI source was changed; do not include that generated-only change unless intended.

## Known Active Defects

- `company-knowledge-os/packages/database` has Kysely/import/result-typing failures.
- Its `FactDAO` incorrectly converts `superseded_by` identifiers into dates.
- `company-knowledge-os/packages/ingestion/src/orchestrator.ts` still creates placeholder episodes instead of running connectors and extraction.
- Gmail, Drive, Notion, and Slack connectors have incomplete API/content/rate-limit/webhook behavior.
- `SyncSqliteAdapter.pop()` selects and marks messages in separate statements.
- Postpone/reschedule paths do not consistently reset `popped`.
- Durable unack recovery and dashboard schedule persistence remain incomplete.
- `TrustWorkflowService` abstains correctly but still uses fixed confidence feature inputs.
- Server-wide auth is not installed across the legacy REST/orchestration APIs.
- `server-lite` lint has pre-existing `no-explicit-any` failures; report them accurately instead of claiming lint is clean.

## Testing Expectations

- Use Vitest for unit and integration tests.
- Add focused tests for every behavior change.
- For Neo4j/pgvector changes, add in-memory coverage and environment-gated live contracts where practical.
- Docker-backed contract failures are environment failures only when the required service is absent; do not classify them as code regressions without evidence.
- Always distinguish commands actually run from tests inferred to pass.
- Before completion, run the smallest relevant build/test set plus a broader regression proportional to risk.
- Run `git diff --check`.

Most recently verified baseline:

- Root build: 31/31 tasks passed.
- Broad non-Docker tests: 57/57 tasks passed.
- Graph service: 56 passed, 4 environment-gated skips.
- Server-lite: 8 passed.
- Live Neo4j contracts: corrections, ingestion jobs, and entity resolution passed.

## Working in a Shared Dirty Tree

- Other agents or the user may have uncommitted changes.
- Never reset, revert, overwrite, or reformat unrelated work.
- Inspect `git status` before and after edits.
- Assign disjoint file ownership when using subagents.
- Do not stage, commit, push, or create a PR unless requested.
- One logical change per eventual PR.

## Documentation Rules

Documentation is derived from source.

- Read controllers before documenting endpoints.
- Read request decorators and types before writing examples.
- Run commands or use existing fixtures for expected output; do not invent output.
- Keep `AGENTS.md`, `CLAUDE.md`, `passes.md`, and `pivot.md` consistent after major architecture or status changes.
- Rebrand ported Conductor copy to Agent Mesh.

## Agent Behavior

- Execute directly unless a missing decision would materially change the result.
- Parallelize independent investigation or implementation with disjoint write scopes.
- Diagnose root causes before implementing fixes.
- Preserve security boundaries even if an older test expects caller-controlled identity.
- Lead handoff summaries with outcomes, verification, and remaining risks.
