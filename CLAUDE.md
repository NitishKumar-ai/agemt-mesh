# CLAUDE.md — AgentMesh CLI Context

Use [`AGENTS.md`](AGENTS.md) as the canonical engineering instructions. This file is the compact context for CLI sessions.

## Mission

AgentMesh is a permission-aware temporal company brain backed by a durable workflow engine. It ingests company sources, builds a Neo4j fact/entity graph, indexes retrievable evidence, and serves cited workflows and natural-language answers.

## Read First

1. [`AGENTS.md`](AGENTS.md) — coding rules, architecture, security boundaries, commands, known defects.
2. [`passes.md`](passes.md) — current production-readiness roadmap and next priorities.
3. [`pivot.md`](pivot.md) — product requirements and completed capability slices.
4. `git status --short` — this repository commonly has concurrent uncommitted work.

## Current Source of Truth

Completed:

- Vector/embedding search with pgvector, HNSW, provider abstraction, evaluation, and permission filtering.
- Persisted tenant-scoped Neo4j temporal reads and correction operations.
- Automatic cross-source entity resolution and merge reassignment.
- Graph/workflow source-permission enforcement, fail-closed ACLs, trusted `request.user`, and admin-gated graph writes.
- Cited trust workflows with no-evidence and contradiction abstention.

Not completed:

- Production OAuth/OIDC/JWT middleware.
- Durable users, tenant membership, roles, groups, policy grants, and connector service identities.
- Connector ACL synchronization.
- A compiling nested `company-knowledge-os` database/ingestion workspace.
- End-to-end real connector ingestion.
- Fully durable queue leases, unack recovery, and dashboard schedules.
- Data-driven confidence calibration and full admin telemetry UI.

Do not claim vector search, permissions, or automatic dedup are missing. Do not claim the whole auth system is complete merely because graph-level enforcement exists.

## Next Work Order

1. Production identity and durable authorization.
2. Repair/consolidate `company-knowledge-os`.
3. Real connectors and ingestion.
4. Queue, scheduler, and restart recovery.
5. Retrieval calibration and admin operations UI.
6. Scale, chaos, security, and release hardening.

Passes 1 and 2 can proceed in parallel.

## Key Locations

| Concern | Location |
| --- | --- |
| Temporal graph and corrections | `graph-service/src/services/GraphService.ts` |
| Neo4j persisted primitives | `graph-service/src/infra/neo4j.client.ts` |
| Graph HTTP policy | `graph-service/src/api/*.routes.ts` |
| Policy and request identity | `graph-service/src/auth/` |
| Vector search | `graph-service/src/search/`, `common/src/models/VectorSearch.ts` |
| Entity resolution | `graph-service/src/jobs/entity-resolution.job.ts` |
| Trust workflows and NL query | `workflow-service/src/services/TrustWorkflowService.ts`, `workflow-service/src/api/workflow.controller.ts` |
| Server bootstrap | `server-lite/src/index.ts` |
| SQLite queue paths | `sqlite-persistence/src/SQLiteQueueDAO.ts`, `server-lite/src/SyncSqliteAdapter.ts` |
| Orchestration scheduler API | `rest/src/services/OrchestrationService.ts` |
| Nested connectors and ingestion | `company-knowledge-os/packages/` |
| Primary frontend | `ui/src/` |
| Legacy frontend | `ui-next/src/` |

## Commands

Windows PowerShell:

```powershell
pnpm.cmd build
pnpm.cmd turbo run test --filter=!@agentmesh/nats --filter=!@agentmesh/kafka
pnpm.cmd --filter @agentmesh/graph-service test
pnpm.cmd --filter @agentmesh/workflow-service test
pnpm.cmd --filter @agentmesh/server-lite test
git diff --check
```

Nested workspace:

```powershell
Set-Location company-knowledge-os
pnpm.cmd exec turbo run build
```

The nested workspace builds cleanly (18/18 packages, verified June 20, 2026). The `@company-knowledge-os/database` package compiles; the prior build blockers were missing `tsconfig.json` (gmail), missing `Connector.fetchObject` implementations (github/gmail/gdrive/notion), and an unwired ingestion orchestrator — all now resolved.

## Security Invariants

- Use only verified `request.user` identity.
- Never trust tenant/user/role/permission values supplied by body, query, or arbitrary headers.
- Keep all graph reads and writes tenant-scoped.
- Unknown source permissions fail closed.
- Persist ACL metadata before exposing ingested facts.
- Separate connector/service identities from tenant-admin human identities.
- Never restore arbitrary tenant-facing Cypher.

## Verification Baseline

Last verified June 20, 2026:

- Root build: 31/31 tasks.
- Broad non-Docker tests: 57/57 tasks.
- Graph service: 56 passed, 4 skipped live/environment contracts.
- Server-lite: 8 passed.
- Live Neo4j contracts passed for corrections, ingestion jobs, and entity resolution.

Re-run relevant checks after changes; this baseline is context, not proof for a future diff.

## CLI Working Rules

- Preserve unrelated dirty-tree changes.
- Use focused searches and inspect source before editing.
- Use `pnpm.cmd` when PowerShell blocks `pnpm.ps1`.
- Do not stage, commit, push, or open a PR unless asked.
- Do not include generated `ui/dist/index.html` hash changes unless UI output intentionally changed.
- Report known pre-existing failures separately from regressions caused by the current change.
- When documentation and source disagree, source wins and documentation must be updated.

## Skill Routing

Use an available skill when explicitly requested or when the task directly matches its purpose. Common routes:

- Bugs/root cause: `/investigate`
- Architecture: `/plan-eng-review`
- Code review: `/review`
- QA: `/qa` or `/qa-only`
- Ship/PR: `/ship`
- Deploy: `/land-and-deploy`
- Save/restore context: `/context-save`, `/context-restore`
- Backlog-ready specification: `/spec`
