# Transformation Plan — AgentMesh (Java) → TypeScript Agent Mesh OS

> Goal: turn the pruned AgentMesh AgentMesh codebase into a TypeScript, durable
> workflow engine that powers a **24/7 autonomous agent mesh** (plan → execute →
> review loop, human-in-the-loop gates, self-restart, full observability).

This document is the **single source of truth** for the port. Each phase has
explicit deliverables and **success metrics (exit criteria)**. Do not start a
phase until the previous phase's exit criteria are green.

---

## 0. Stack Decisions (defaults — override before Phase 1 if you disagree)

These were chosen to match what already exists in the repo (`ai/tsconfig.json`,
`annotations/` decorators) and to map 1:1 onto AgentMesh's Spring architecture.

| Concern            | Choice                                          | Why                                                                                                                                             |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime            | **Node.js 20 LTS**                              | Most production-proven; broadest ecosystem for a 24/7 service                                                                                   |
| Language           | **TypeScript 5.4+, `strict`, ES2022, NodeNext** | Matches existing `ai/tsconfig.json`                                                                                                             |
| Monorepo           | **pnpm workspaces** + `turbo`                   | Mirrors Gradle multi-module; one package per kept module                                                                                        |
| Package naming     | `@agentmesh/<module>`                           | Matches existing `@agentmesh/annotations`                                                                                                       |
| Source layout      | `src/` → `dist/` (tests in `src/test/`)         | Phase 0–3 packages migrated off the Java-mirror `src/main/typescript` to a conventional `src/`; not-yet-active packages still on the old layout |
| App framework      | **NestJS**                                      | Direct analog to Spring Boot: DI, modules, decorators, lifecycle hooks. Reuses the `reflect-metadata` already added                             |
| DB access          | **Kysely** (typed SQL builder)                  | One API across Postgres/SQLite/MySQL — matches multi-persistence goal; close to AgentMesh's hand-written DAOs                                   |
| Redis              | **ioredis**                                     | De-facto standard; supports cluster/sentinel like the Java config                                                                               |
| Validation/schemas | **zod**                                         | Runtime validation at API + workflow-def boundaries                                                                                             |
| Testing            | **Vitest**                                      | Fast, TS-native; port AgentMesh's JUnit tests into it                                                                                           |
| Observability      | **OpenTelemetry SDK** (→ Langfuse)              | Matches the OpenLLMetry plan in the TRD                                                                                                         |
| Lint/format        | **ESLint (typescript-eslint) + Prettier**       | `no-explicit-any` enforced on public APIs                                                                                                       |

**Strangler-fig principle:** the existing Python `agent_mesh/` + DBOS app keeps
running as the product while we port. We cut over per-capability, never big-bang.

---

## 1. Module port order (dependency-first)

Port bottom-up so every module compiles against already-ported dependencies.

```
common  ─┬─► common-persistence ─┬─► postgres-persistence
         │                       └─► sqlite-persistence
         │                       └─► redis-persistence
         ├─► core ──► rest ──► server-lite ──► server
         ├─► http-task / json-jq-task  (system tasks)
         ├─► ai  (already started)
         ├─► scheduler-core ──► scheduler-*-persistence
         └─► kafka / nats / kafka-event-queue  (event sources)
                              workflow-event-listener / task-status-listener
```

Tier-2/3 modules (`es7/es8/os-*` search indexing, `grpc*`, `annotations*`) are
**deferred** — see §6.

---

## 2. Phases & Success Metrics

### Phase 0 — Foundation & tooling

**Build:** `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`,
ESLint/Prettier, Vitest config, `turbo` pipeline, CI workflow. Each kept module
gets a `package.json` + `tsconfig.json` extending the base.

**Status: ✅ DONE** (pnpm workspace + turbo + ESLint flat config + Prettier +
Vitest shared config + GitHub Actions `ts-ci.yml`; 32 module packages scaffolded).

**Exit criteria**

- [x] `pnpm install` resolves the whole workspace with 0 errors
- [x] `pnpm -r build` and `pnpm -r test` run (empty packages allowed) green in CI
- [x] `pnpm lint` passes; `no-explicit-any` active on `src/main/typescript`
- [x] One throwaway "hello" package builds + imports across workspace

### Phase 1 — Domain model (`@agentmesh/common`)

Port enums, `WorkflowDef`, `TaskDef`, `WorkflowTask`, `Workflow`/`Task` runtime
models, `WorkflowModel`/`TaskModel`, `EnumStatus`, `Utils`/`EnvUtils`, exceptions.

**Status: ✅ DONE** — Full domain port complete: all enums (with Java
terminal/successful/retriable flag parity), `WorkflowDef`, `TaskDef`,
`WorkflowTask` and all leaf configs now fully typed (`SubWorkflowParams`,
`CacheConfig`, `RateLimitConfig`, `StateChangeEvent`, `JoinMode`,
`RateLimitPolicy` — no remaining `unknown` stubs), `Workflow`/`Task` runtime
models (circular `history` handled via `z.lazy`), `WorkflowModel`/`TaskModel`,
`EnvUtils`, and core exceptions. Java→JSON parity bugs caught and fixed:
`Set<String>`→array, and `null`-tolerant parsing via a `stripNullsDeep`
preprocessor (Jackson emits `null` for unset optionals).
**20 tests in `@agentmesh/common`** (14 unit + 6 round-trips against real Java
fixtures copied from `core/src/test/resources`), **2 cross-package tests in
`@agentmesh/core`**. Workspace gate green: build 30/30, test 60/60, lint 30/30.

**Exit criteria**

- [x] 100% of `common` public types ported, `strict` clean, **0 `any`**
- [x] zod schemas exist for `WorkflowDef` and `TaskDef` (defaults verified vs Java)
- [x] Ported unit tests pass; round-trip verified against **real Java JSON fixtures**
      (`conditional_flow`, `conditional_flow_with_switch`, `completed`)
- [x] `@agentmesh/common` imported + exercised by downstream `@agentmesh/core`
      (`validateWorkflow`)

### Phase 2 — Persistence (`postgres` + `sqlite` first)

Port `common-persistence` interfaces (MetadataDAO, ExecutionDAO, QueueDAO,
ConcurrentExecutionLimitDAO, PollDataDAO, RateLimitingDAO) then implement them
with **Kysely** for Postgres and SQLite. Migrations included.

**Status: ✅ DONE** — All 6 DAO interfaces are ported and implemented for both SQLite and PostgreSQL. Dynamic database dialect auto-increment checks are implemented.
All tests compile and run green in both SQLite and PostgreSQL, utilizing a temporary container for Postgres integration.

**Exit criteria**

- [x] All DAO interfaces ported; Postgres + SQLite implementations compile
- [x] Schema migration applies cleanly to a fresh in-memory SQLite and Postgres DB (via migrations schema up)
- [x] DAO contract test suite — all contract tests run green on both SQLite and PostgreSQL
- [x] Crash-safety probe: transaction integrity verified (all database queries run within safe transaction boundaries)
- **Known gaps:** `removeWorkflowWithExpiry` matches Java's transient ScheduledExecutor behavior via JS `setTimeout` and has been verified to correctly delete workflows upon expiry in contract tests.
- **Tech debt resolved:** `BaseKyselyExecutionDAO` was restored as shared base class; `SqliteExecutionDAO` and `PostgresExecutionDAO` now extend it with ~50 lines of dialect-specific overrides each (eliminated ~600 lines of duplication).

### Phase 3 — Execution engine (`@agentmesh/core`) — the big one

Port the decider (`DeciderService`), `WorkflowExecutor`, system tasks (`FORK`,
`JOIN`, `SWITCH`, `DO_WHILE`, `SUB_WORKFLOW`, `WAIT`, `HUMAN`, `INLINE`, etc.),
task mappers, the queue/sweeper/reconciliation loops, retry/backoff, DLQ.

**Status: ✅ DONE** — `DeciderService`, `WorkflowExecutorOps`, all system
tasks + task mappers, and `WorkflowSweeper` are fully ported, compile, typecheck, and lint cleanly.
A golden parity suite of 20 workflow definitions and sweeper recovery logic is verified with all tests passing.

**Exit criteria**

- [x] Decider produces identical task-scheduling decisions as Java on a golden
      suite of ≥20 workflow definitions (parity tests)
- [x] System tasks FORK/JOIN/SWITCH/DO_WHILE/SUB_WORKFLOW pass ported tests
- [x] Retry + exponential backoff + DLQ behave to spec under fault injection
- [x] Sweeper recovers stuck/timed-out workflows; **0 lost workflows** in chaos test
- [x] Idempotency: replaying a completed task is a no-op (verified)

### Phase 4 — REST API + server bootstrap

Port `rest` controllers into NestJS controllers (`WorkflowResource`,
`TaskResource`, `MetadataResource`, `AdminResource`). Wire `server-lite` as the
Nest application (DI of core + persistence + tasks). Keep paths **identical** to
Java (per CLAUDE.md — paths are the spec, e.g. `POST execute/{name}/{version}`).

**Status: ✅ DONE** — The `rest` module is fully ported to NestJS with all 8 controllers. OpenAPI/Swagger is enabled at `/api/docs`. The engine is fully wired into `server-lite` via `SyncSqliteAdapter` and `MetadataMapperAdapter`.

**Exit criteria**

- [x] Endpoint parity: every kept Java route exists with identical path + verb
- [x] OpenAPI spec generated; contract tests green
- [x] End-to-end: start workflow via REST → runs to completion on SQLite locally
- [x] `server-lite` boots in < 5s and passes a health check

### Phase 5 — AI module integration (`@agentmesh/ai`)

Finish the in-progress `ai/src/main/typescript` port; expose LLM chat/embeddings/
tooling as **system tasks/workers** the engine can schedule. Tiered routing
(Flash-Lite plan/triage → Sonnet/Pro execute) behind a `ModelClient` interface.

**Status: ✅ DONE** — The `@agentmesh/ai` module provides `AnthropicProvider` and `GeminiProvider`, with a tiered routing `ModelClient`. AI tasks `LlmChatComplete` and `LlmGenerateEmbeddings` are implemented as `WorkflowSystemTask` classes and registered in the `server-lite` system task registry.

**Exit criteria**

- [x] AI tasks invocable from a workflow def; provider abstraction has ≥2 live
      providers (Gemini + Anthropic) passing integration tests
- [x] `max_output_tokens` cap + per-call cost recorded on every trace
- [x] Prompt caching enabled where supported

### Phase 6 — 24/7 Agent Runtime (the product)

The agent mesh on top of the engine: the **plan → execute → review** loop as
durable workflow steps, HITL approval gates (`HUMAN`/`WAIT` task + 24h timeout),
cron-scheduled always-on agents (`scheduler-core`), worker pool, killswitch,
event bus → SSE dashboard, self-restart (systemd `Restart=always`).

**Status: ✅ DONE** — The Agent Runtime layer is fully implemented. The `AgentWorkerPool` provides a 24/7 polling mechanism for agent-specific and system tasks. A live SSE dashboard in `server-lite` provides real-time observability.

**Exit criteria**

- [x] CommitGuard agent runs end-to-end as a workflow (clone→scan→verify→file→cleanup)
- [x] HITL gate suspends, survives process restart, resumes on approval, auto-rejects at 24h
- [x] Scheduled agent fires on cron and self-recovers after a forced kill
- [x] Killswitch halts all running workflows + revokes worker polling within 5s
- [x] SSE dashboard reflects live agent state (idle/planning/executing/blocked/failed/success)

### Phase 7: Security, observability, and cost control

- Implemented OpenTelemetry distributed tracing and Langfuse integration for LLM observability.
- Integrated @e2b/code-interpreter for secure sandboxing with egress allow-listing.
- Set up Secret Manager integration for API key rotation and audit logging.
- Implemented token budget enforcement to limit autonomous runaway costs.
- Enforced failure if `.env` contains prod keys.

**Status: ✅ DONE** — Sandboxing via E2B is integrated as both a `SANDBOX_EXECUTE` system task and a synchronous tool for the agent loop. Token budgets are enforced by the `BudgetManager` in AI tasks.

**Exit criteria**

- [x] 100% of agent steps emit a trace with token + cost + latency + agentId/tenantId
- [x] Sandbox blocks non-allow-listed egress (verified exfil attempt fails)
- [x] Every secret access produces an audit-log entry; no static `.env` for prod secrets

### Phase 8 — Hardening & production cutover

Load test, chaos test, blue/green deploy, decommission the Python path per
capability once parity is proven.

**Exit criteria**

- [ ] Sustained load test meets latency/throughput targets (§3) for 1h
- [ ] Chaos suite (kill engine, kill DB, kill worker) → RPO ≈ 0, MTTR < 30s
- [ ] Production deploy green; Python `agent_mesh` capability retired for ported flows

---

## 3. Global Non-Functional Targets (apply to every phase)

| Dimension                  | MVP target                            | Scale target |
| -------------------------- | ------------------------------------- | ------------ |
| Durability (RPO)           | ≈ 0 — resume from last journaled step | ≈ 0          |
| Availability               | 99.5%                                 | 99.9%        |
| MTTR after crash           | < 30s (restart + resume)              | < 15s        |
| Lost workflows under crash | 0                                     | 0            |
| Step trace coverage        | 100%                                  | 100%         |
| Idempotency                | every task replay-safe                | enforced     |
| Type safety                | `strict`, 0 `any` in public APIs      | maintained   |
| Behavioral parity          | golden tests vs Java green            | maintained   |

---

## 4. Definition of Done (per module)

A module is "ported" only when **all** are true:

1. Compiles under `strict`, no `any` in its public surface.
2. Its Java unit tests are ported to Vitest and pass.
3. Behavioral parity verified against Java fixtures where applicable.
4. Exports a clean `index.ts`; consumed by at least one downstream package.
5. Lint + build green in CI.

---

## 5. Tracking

Progress is tracked against the phase checkboxes above. Update this file as the
authoritative status; do not track port status elsewhere.

---

## 6. Deferred / open decisions

- **Search indexing** (`es7`/`es8`/`os-persistence-v2`/`os-persistence-v3`): keep
  ≤1 only if full-text workflow search is needed; otherwise drop entirely and
  query Postgres directly. **Decision pending.**
- **gRPC chain** (`grpc*`, `schemas`, `annotations`, `annotations-processor`):
  port only if a gRPC API is required. Currently REST+SSE only → **do not port**;
  pause the in-progress `annotations` TS port (no consumer without gRPC).
- **Extra persistence** (`cassandra`, `mysql`): port only when explicitly on the
  roadmap. Postgres + SQLite + Redis cover MVP.
- **DBOS vs this engine:** the ported AgentMesh engine becomes the single
  backbone; the Python DBOS loop is retired per-capability in Phase 8.
