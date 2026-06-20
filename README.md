# AgentMesh

AgentMesh is a permission-aware, temporal **company brain** built on a durable workflow engine. It ingests company sources, stores facts and entities in a Neo4j graph, indexes retrievable evidence with vector search, and serves cited answers through trust workflows and a natural-language query API.

## What it is

- **Company memory**: connectors pull sources (Slack, Gmail, Drive, Notion, GitHub, etc.), extraction turns them into entities, relations, and facts, and the graph tracks provenance and change over time.
- **Temporal knowledge**: every fact carries valid time and recorded time, so the system can answer "what do we believe now?" and "what did we believe then?".
- **Permission-safe retrieval**: all graph reads, vector searches, and workflow answers are filtered by source ACLs; unknown ACL state fails closed.
- **Durable execution**: the retained orchestration substrate (inspired by Netflix Conductor) provides long-running workflows, retries, sagas, human-in-the-loop gates, and polyglot workers.
- **Trust workflows**: onboarding briefs, weekly digests, incident briefs, meeting prep, and account summaries cite their evidence and abstain when evidence is missing or contradictory.

## Repository layout

The root is a pnpm/turbo TypeScript monorepo. `company-knowledge-os/` is a second, nested pnpm/turbo workspace for connectors, database, extraction, and ingestion packages.

| Layer | Packages | Responsibility |
| --- | --- | --- |
| Domain | `common` | Zod models, enums, workflow/task types, vector-search contracts |
| Persistence interfaces | `common-persistence` | Execution, metadata, queue, and other DAO interfaces |
| Storage interfaces | `common-storage` | `ExternalPayloadStorage`, `FileStorage` |
| Engine | `core` | Workflow execution, decider, system tasks, sweeper |
| Graph & search | `graph-service` | Temporal facts, Neo4j, corrections, entity resolution, policy enforcement, vector retrieval |
| Trust workflows | `workflow-service` | Cited workflows, NL query, abstention, confidence |
| Nested Knowledge OS | `company-knowledge-os` | Connectors, database, extraction, ingestion |
| Root connector package | `knowledge-os` | Connector interfaces and root-workspace connector code |
| REST | `rest` | NestJS orchestration/task/metadata APIs |
| Server | `server-lite` | NestJS bootstrap, SQLite wiring, workers, runtime scheduler |
| Agent runtime | `agent-runtime` | Agents, tools, workers, LLM execution |
| AI | `ai` | Anthropic/Gemini providers and model routing |
| Frontend | `ui` | React 19 + Vite primary interface |
| Legacy frontend | `ui-next` | React 18 + MUI; port only still-needed features |

See [`AGENTS.md`](AGENTS.md) for canonical engineering instructions, security invariants, and commands.

## Current state

Completed and verified:

- Vector/embedding search with pgvector, HNSW, hosted/local providers, permission filtering, reindexing, and evaluation.
- Neo4j production graph path with tenant-scoped persisted temporal reads and correction primitives.
- Cross-source entity resolution with exact, alias, and fuzzy matching, automatic merge, and reassignment.
- Graph/workflow permission enforcement with trusted `request.user`, fail-closed unknown ACLs, admin-gated graph writes, and disabled arbitrary HTTP Cypher.
- Cited trust workflows with no-evidence and contradiction abstention.

Active production blockers:

1. Production OAuth/OIDC and durable authorization.
2. Repair and consolidation of the nested `company-knowledge-os` workspace.
3. Real connector ingestion and ACL synchronization.
4. Queue/scheduler recovery and persistence.
5. Retrieval calibration and the operations dashboard.

See [`passes.md`](passes.md) for the production-readiness roadmap and [`pivot.md`](pivot.md) for product requirements and completed capability slices.

## Getting started

```bash
# Install dependencies
pnpm install

# Build the root workspace
pnpm build

# Run focused tests (excludes Docker-dependent Kafka/NATS suites)
pnpm.cmd turbo run test --filter=!@agentmesh/nats --filter=!@agentmesh/kafka
```

On Windows PowerShell use `pnpm.cmd` when `pnpm.ps1` is blocked.

### Run the local server

```bash
cd server-lite
pnpm start
```

- API: http://localhost:8080/api
- Swagger UI: http://localhost:8080/api/docs
- Primary UI (after `pnpm --filter @agentmesh/ui build`): http://localhost:8080/index.html

### Run the nested workspace

```bash
cd company-knowledge-os
pnpm exec turbo run build
```

This workspace is currently being repaired; see `passes.md` Pass 2.

## Development

- **Build**: `pnpm build`
- **Lint**: `pnpm lint`
- **Test**: `pnpm test`
- **Format**: `pnpm format`
- **Graph-service tests**: `pnpm --filter @agentmesh/graph-service test`
- **Workflow-service tests**: `pnpm --filter @agentmesh/workflow-service test`
- **Server-lite tests**: `pnpm --filter @agentmesh/server-lite test`

## License

Apache 2.0
