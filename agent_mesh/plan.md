<!-- /autoplan restore point: /Users/friday/.gstack/projects/Agent_mesh/main-autoplan-restore-20260603-155423.md -->

# Technical Requirements Document: 24/7 Agent Mesh OS

## TL;DR

- **Build the orchestration backbone on a durable-execution engine, not a raw task queue.** For a solo founder on Python/TS, start with **DBOS** (Postgres-only, runs in-process as a library, zero new infrastructure) and keep the workflow code behind an interface so you can migrate to **Temporal** later if multi-tenant fan-out demands it. The weekend-MVP fallback is a custom asyncio loop backed by **Redis Streams + Dramatiq**. Avoid plain in-process asyncio queues for anything beyond the scaffold — they lose all state on crash.
- **Run agents on hosted APIs (Gemini Flash-Lite/Flash + Claude Haiku/Sonnet), not the L4, until you are saturating the GPU.** Self-hosting an 8B model on a GCP L4 (~$516/mo) only beats Gemini 2.5 Flash-Lite ($0.10/$0.40 per M tokens) above ~1.3 billion output tokens/month at near-100% utilization — a volume a single L4 can barely physically produce. Below that, the API is cheaper and zero-ops. Route a cheap model (Flash-Lite) for plan/triage and a stronger model (Sonnet/Gemini Pro) for execution.
- **Adopt Anthropic's "workflows over agents" discipline:** deterministic orchestrator-worker + evaluator-optimizer code paths, a shared event bus (Redis Streams) for agent memory, Firecracker/gVisor sandboxes for any code execution, and Langfuse for observability. The plan→execute→review 3-pass loop maps directly onto durable-execution steps with human-in-the-loop approval gates.

## Key Findings

1. **Durable execution is now the standard primitive for production agents.** Durable execution "crossed the chasm into the early majority" in late 2025, driven primarily by AI-agent infrastructure needs. Per a May 2026 durable-execution survey, "Cloudflare Workflows reached general availability in 2025... LangGraph, Pydantic AI, and the OpenAI Agents SDK have all adopted durable execution as a core primitive," and Microsoft shipped its Azure Durable Task Extension for multi-day human-in-the-loop pauses in late 2025; Vercel launched a Workflow DevKit. The plan→execute→review loop and human-in-the-loop gates map directly onto durable execution's suspend/resume and journal/replay primitives.

2. **The orchestration choice is a spectrum of operational cost.** Temporal is the most mature/proven: per its Feb 17, 2026 Series D announcement ($300M at a $5B valuation led by a16z), it has "processed 9.1 trillion lifetime action executions" with "380% year-over-year revenue growth," and named customers are "OpenAI, AgentMesh, Snap, Datadog, Yum! Brands, and ADP" — Temporal CTO Maxim Fateev: "Every time you generate the image using OpenAI, it uses Temporal behind the scenes." Its OpenAI Agents SDK durable-execution integration is in Public Preview. The cost is high operational complexity (requires Cassandra or PostgreSQL plus history/matching services). DBOS is a library that runs in-process on Postgres with "zero new infrastructure." Inngest/Restate/Trigger.dev are event-driven middle grounds. Cloudflare Workflows + Durable Objects is the cloud-native option that fits the user's existing Cloudflare footprint.

3. **The LLM economics strongly favor APIs for a solo founder's volume.** Gemini 2.5 Flash-Lite is, per Google's official pricing, exactly $0.10/M input and $0.40/M output with a 1,048,576-token context (released July 22, 2025). A GCP L4 costs ~$516/month on-demand running 24/7; break-even vs Flash-Lite is ~1.3 billion output tokens/month — a volume that requires the GPU to be saturated continuously.

4. **2025-era agent frameworks converged on four patterns:** graph-based (LangGraph), role-based (CrewAI), handoff-based (OpenAI Agents SDK), and hierarchical (Google ADK). Anthropic's guidance is to start with direct LLM API calls and simple composable patterns, avoiding premature framework lock-in.

5. **Sandbox isolation is the highest-leverage security decision.** Standard Docker/runc shares the host kernel and is insufficient for untrusted LLM-generated code; the minimum acceptable boundary is a Firecracker/Kata microVM (E2B's choice, ~150ms cold start from pre-warmed snapshots, same tech as AWS Lambda) or gVisor (Modal's choice, lighter weight). E2B's growth illustrates the demand: it went from 40,000 sandbox sessions per month in March 2024 to roughly 15 million per month by March 2025.

## Details

### 1. Orchestration / Queue Backend

**(a) Plain Python asyncio in-process queue.** Zero durability — all in-flight task state is lost on process crash or restart. asyncio "doesn't scale predictably for persistent background work." Acceptable ONLY for the weekend scaffold and for in-process fan-out within a single durable step. Not a production backbone.

**(b) Redis + Celery / RQ / Dramatiq.** Mature task queues with retries and dashboards. Key reliability nuance: Celery acks tasks early by default (`ACKS_EARLY=True`) so a worker crash after `BRPOP` permanently loses the task payload; Dramatiq acks only after processing completes (a safer default it does not let you change) and is strongest with RabbitMQ's native AMQP acknowledgement. Benchmarks: Huey, Dramatiq, and Taskiq processed 20,000 jobs roughly 10× faster than Python-RQ. RQ is the simplest (Redis-only, 5-minute setup) but lacks complex workflows. These are task queues, NOT durable execution — they retry individual tasks but do not journal/replay a multi-step workflow's state. Good for the fast fallback; insufficient alone for long-running multi-step agent jobs needing crash recovery.

**(c) Durable execution engines (Temporal, Inngest, Restate, DBOS).** These guarantee a function resumes exactly where it left off after a crash via journal/replay. Temporal records every state change in an append-only Event History and supports "very long-running workflows" maintaining durable state for weeks to years; high operational complexity (Cassandra/PostgreSQL + history service + matching service + workers). DBOS persists both application data and execution state in Postgres, runs fully in-process as a library with zero new infrastructure, and offers tight exactly-once when side effects stay in the same Postgres. Inngest is serverless-first/event-driven with the lowest adoption friction; Restate is the lightest-footprint journal/replay engine for edge/serverless. A widely-cited 2026 engineering rubric: "most backend services in 2026 can ship durable execution with DBOS and come back to Temporal if and when they actually hit the wall."

**(d) Cloudflare Workers + Queues + Workflows + Durable Objects.** Workflows is GA durable execution built on Workers; steps auto-retry and memoize, instances persist state for "minutes, hours, days, or weeks," and `waitForEvent` enables human-in-the-loop approvals in one line. Durable Objects provide single-threaded stateful coordination (1,000 req/s soft limit per object, scale horizontally, 10GB SQLite each on paid). Pricing is Workers-based (CPU time + requests + storage), $5/month account minimum. Critical constraint: per-invocation CPU time caps at 30s default, raisable to 5 minutes — fine for orchestration logic and short LLM calls, but heavy lifting must be offloaded. Excellent fit given existing Cloudflare infra.

**Recommendation:** Given a solo founder optimizing for low operational burden, **start with DBOS on Postgres** — you already need a Postgres, and it adds durability with no new infrastructure. Wrap the workflow code behind an interface and migrate to **Temporal** only if tenancy/cross-service fan-out forces it (the rubric: "skip DBOS and start with Temporal" only if you're "building a workflow platform, or a product where workflows coordinate across three or more services with meaningful fan-out"). The Jules-style sandboxed plan→execute→review loop becomes three durable steps per task, each individually retryable and resumable. **Weekend-MVP fallback:** custom asyncio orchestrator + Redis Streams (event bus) + Dramatiq (worker execution), scaffoldable in a weekend and sharing Redis with the memory bus.

### 2. LLM Backbone & Routing Strategy

**API pricing landscape (2026):** Gemini 2.5 Flash-Lite $0.10/$0.40 per 1M in/out (1M context); Gemini 2.5 Flash ~$0.30/$2.50; Claude Haiku 4.5 ~$1/$5; Claude Sonnet 4.6 ~$3/$15; Gemini 2.5 Pro ~$1.25/$10. Prompt caching (Gemini ~90% off cached input; Anthropic cached reads ~0.1× base input) and Batch APIs (50% off) dramatically cut agent costs that reuse large system prompts.

**Self-hosting on GCP L4:** L4 = 24GB VRAM, ~300 GB/s bandwidth, runs 7–13B FP16 or larger quantized. GCP cost (verified via Holori/Economize, us-central1): Compute Engine g2-standard-4 (1× L4) **$0.7068/hr on-demand (~$516/mo at 730 hrs)**, ~$0.65/hr 1-yr CUD, ~$0.625/hr spot; Cloud Run L4 ~$0.672/hr (no zonal redundancy, GPU only, plus billed vCPU/memory). Note GCP GPU discounts are unusually shallow (~8–12%, vs 60–90% for CPU). Throughput: a single L4 running an 8B model under vLLM with continuous batching does roughly **500–1,200 aggregate output tok/s** at concurrency (single-stream ~30–45 tok/s, decode is bandwidth-bound). **These L4-specific numbers are estimates extrapolated** from RTX 4090 (vLLM ~485 tok/s at 10 concurrent, ~71 tok/s single-stream) and A100 (~2,622 gen tok/s aggregate) benchmarks — the L4's 300 GB/s bandwidth and 24GB KV-cache ceiling pull it well below those cards. Validate with a direct `vllm bench serve` run before committing GPU spend.

**Break-even:** A 24/7 L4 (~$516/mo) equals Gemini 2.5 Flash-Lite ($0.40/M output) at ~1.29 billion output tokens/month. But a fully-utilized L4 at ~800 tok/s only physically produces ~2.1B output tokens/month (tok/s × 3,600 × 730). The break-even and the GPU's capacity ceiling sit in the same 1.3–3B range — meaning the L4 only wins if kept near 100% utilized 24/7. On a blended 3:1 input:output agent workload (Flash-Lite blended ~$0.175/M), break-even rises to ~2.95B total tokens/month, which a single L4 struggles to reach because input/prefill also consumes GPU time while Flash-Lite charges only $0.10/M for input. **Verdict: APIs win on cost until you saturate the GPU.** The L4 case strengthens with privacy/no-egress requirements, heavy long-context/RAG input volume, or sustained high concurrency.

**Recommended routing strategy:** Tiered routing cuts costs 60–80% without quality loss. Use a cheap model (Gemini 2.5 Flash-Lite) as a router/classifier and for planning/triage (~90% of calls); escalate to a stronger model (Claude Sonnet 4.6 or Gemini 2.5 Pro) for execution/code generation (~8–10%); reserve the top tier (Opus/GPT-5-class) for the hardest ~2%. Cap `max_output_tokens` (reasoning models silently burn thousands of hidden thinking tokens at the output rate), and prefer batched/cached inference. Repurpose the L4 for embeddings, reranking, and a self-hosted small model for high-volume internal classification (e.g., CommitGuard triage) where privacy or volume justify it.

**Context window for agent loops:** Gemini Flash/Pro offer 1M-token context (2M on 2.5 Pro), ideal for agent loops that accumulate tool outputs; Claude offers 200K (1M on Sonnet/Opus 4.6). For most agent loops, aggressive context management (summarize/store to the memory bus) beats stuffing the window — it controls both cost and latency.

### 3. Agent Architecture Patterns

**Anthropic's core guidance:** Draw a hard line between **workflows** (LLMs + tools orchestrated through predefined code paths) and **agents** (LLMs dynamically directing their own processes). Start with direct LLM API calls; "many patterns can be implemented in a few lines of code." Frameworks "often create extra layers of abstraction that can obscure the underlying prompts and responses" and "make it tempting to add complexity when a simpler setup would suffice." The five composable patterns: prompt chaining, routing, parallelization, orchestrator-workers, and evaluator-optimizer (one LLM generates a response while another evaluates in a loop — this is exactly the plan→execute→review pattern). Agents should "gain ground truth from the environment at each step (such as tool call results or code execution)" and "pause for human feedback at checkpoints or when encountering blockers."

**Frameworks (2025-era):** LangGraph (graph state machine, most control, v0.4 added improved state persistence + human-in-the-loop checkpoints, verbose); CrewAI (role-based, fastest prototype, heaviest token footprint — roughly 3× the other frameworks on simple one-tool-call tasks per an independent 2026 comparison); OpenAI Agents SDK (handoff-based, minimal, OpenAI-coupled, no shared mutable state between agents); Google ADK (hierarchical, native A2A protocol, Vertex/Gemini-native). MCP (Model Context Protocol) and A2A moved to Linux Foundation stewardship in 2025 and are now broadly supported.

**Patterns to adopt:** Deterministic orchestrator-worker for task decomposition; evaluator-optimizer for the 3-pass review loop; routing for LLM-tier selection; ground-truth checks at each step; human-in-the-loop approval gates at high-risk checkpoints (mapped to durable-execution `waitForEvent`/suspend). **Patterns to avoid:** Premature multi-framework adoption; free-form ReAct loops with unbounded tool calls (cost spikes); implicit shared mutable state between agents; deep agent-to-agent autonomy without audit gates.

**Recommendation:** Build the orchestration core yourself (per Anthropic guidance) on top of the durable-execution engine. Use LangGraph selectively only if a specific complex agent needs its graph state persistence. Route inter-agent communication primarily through the shared event bus, not direct agent-to-agent calls, to preserve auditability and decouple failure domains.

### 4. Shared Memory & State

**Event bus options:** Redis Streams (sub-ms p99 latency, ~480K msg/s, memory-bound, durability requires AOF `appendonly yes` — with default RDB snapshots a crash can lose minutes of messages); NATS JetStream (~820K msg/s, sub-ms, K8s-native, one binary for pub/sub + durable streams + KV + queue groups); Kafka (~1.2M msg/s, weeks of retention, highest ops overhead, ~12.5ms p99). For a solo founder under 10K msg/s, "Redis Streams is probably enough."

**Agent memory frameworks:** Mem0 (hybrid vector+graph+KV, three-tier user/session/agent scopes; per its arXiv:2504.19413 / ECAI 2025 paper, "26% relative improvements in the LLM-as-a-Judge metric over OpenAI" on LOCOMO — 66.9% vs 52.9% — "with 91% lower p95 latency and 90% fewer tokens"; ~48K GitHub stars, the exclusive memory provider in the AWS Agent SDK); Letta/MemGPT (OS-style core RAM + archival disk, agent self-manages memory via tools); Zep (temporal knowledge graph). Crucially, Letta's own benchmark argues against over-engineering: "This simple agent achieves 74.0% on LoCoMo with GPT-4o mini and minimal prompt tuning, significantly above Mem0's reported 68.5% score for their top-performing graph variant" — i.e., a plain filesystem of conversation histories beat specialized memory libraries.

**Recommendation:** Use **Redis Streams as the shared memory bus** — agents publish events (plan created, step done, review verdict) to per-agent and shared streams with consumer groups; enable AOF for durability. Layer a **vector store (start with pgvector in your existing Postgres; adopt Mem0 only if you want managed multi-store recall)** for semantic memory, and use Postgres KV/JSONB for structured working state. This consolidates infrastructure: Redis + Postgres serve the queue, bus, memory, and durable-execution state. Start memory simple (filesystem/Postgres) before reaching for a dedicated framework. Avoid Kafka unless throughput genuinely demands it.

### 5. Sandboxing & Security

**Isolation:** Standard Docker shares the host kernel — a kernel exploit escapes to host, "explicitly insufficient for untrusted agent code execution." The minimum acceptable boundary for LLM-generated code is a **Firecracker/Kata microVM** (kernel-level isolation, ~150ms cold start, used by E2B; each sandbox gets its own kernel and network namespace) or **gVisor** (userspace kernel, lighter, used by Modal; GKE Sandbox / Cloud Run gen2 offer managed gVisor). Threat-model mapping: gVisor for medium-threat, cost-sensitive multi-tenant; Firecracker for high-threat LLM-generated code. E2B pricing ~$0.05/vCPU-hr, up to 24-hour sessions, no GPU (Modal adds GPU support including L4 via gVisor).

**Secrets:** Treat each agent as a distinct service account with its own scoped identity; never a master key. Use runtime injection from a vault (GCP Secret Manager, ~$0.40/secret/month, every access generates a Cloud Audit Log), short-lived scoped tokens (GCP/AWS IAM support these), never persistent `.env` for high-security. Credential compartmentalization across the agent hierarchy: the orchestrator holds minimal/no credentials and does not pass broad credentials to subagents — "if a subagent is compromised through prompt injection... it has access to the full credential set." Scope credentials to the task, not the agent instance.

**Blast-radius containment & rate limiting:** Per-tool, per-dataset, per-action least privilege (e.g., a Stripe restricted key with `refunds.write` only, not the master key); high-risk actions require step-up/human approval gates; enforce strict token/cost budgets and rate limits per agent; segment environments to limit lateral movement; treat all agent inputs/outputs as untrusted (prompt-injection defense); implement a killswitch (revoke tokens + halt workflows).

**Audit logging:** Full tool-call logging per agent (who/when/why), behavioral anomaly detection (e.g., a sudden access-pattern change triggers context-aware revocation), retain inventories/approvals/change logs. Operating principle: "If you only implement three controls, implement these: unique identity, minimal permissions, full tool-call logging."

### 6. Observability & Cost Control

**Tools:** Langfuse (open-source MIT, self-hostable, tracing + prompt management + cost tracking, free Hobby tier to 50K events/mo; SDK setup in a few hours); LangSmith (LangChain-native, closed, 5K traces/mo free); Helicone (proxy, one-line integration, request/response level, weaker on multi-step agent traces, now in maintenance mode); OpenLLMetry/Traceloop (vendor-neutral OpenTelemetry SDK, routes to any backend including Langfuse — the safest instrumentation choice for portability); Arize Phoenix (OTel-native, eval-heavy); Pydantic Logfire (10M spans/mo free, 1–2hr setup).

**Recommendation:** **Langfuse** (self-hosted or cloud Hobby tier) as the primary observability platform — open-source, agent-trace-aware, strong cost/token tracking, generous free tier ideal for a solo founder. Instrument via **OpenLLMetry** spans to retain backend portability. Track per-agent and per-customer cost attribution by tagging every trace with agent ID and tenant ID. Add cost/latency dashboards from day one ("they're easy to measure and immediately actionable"), then layer error rates, then quality/eval metrics — "don't try to track everything at once."

### 7. Deployment Topology

**Recommended topology (GCP + Cloudflare):**

- **Cloudflare edge:** Workers for API ingress, auth, and webhooks; Durable Objects for per-tenant/per-agent coordination state; optionally Workflows for lightweight durable orchestration if you go Cloudflare-native. Cloudflare also hosts the public dashboard/control plane and provides DDoS/WAF at the edge.
- **GCP core:** A persistent Compute Engine VM (or GKE node) running the orchestration engine (DBOS-in-process, later Temporal) + the always-on agent worker pool + Postgres (durable-execution state, pgvector, KV) + Redis (event bus/memory). The L4 GPU node runs vLLM for embeddings/reranking and any self-hosted small model — scaled to zero on Cloud Run when bursty, or kept warm on Compute Engine if continuously used (note Cloud Run GPU requires the full vCPU/memory to stay allocated for 24/7 use, so it offers no idle savings for an always-on service).
- **Sandbox tier:** E2B (managed Firecracker) or self-hosted Firecracker for agent code execution; or GKE Sandbox (gVisor) for managed isolation on infra you control.

**Keeping agents alive (24/7):** The cron-watchdog approach is valid but is the weakest tier. Prefer **systemd with `Restart=always` + `WatchdogSec` + `Type=notify`** — the agent pings `WATCHDOG=1` periodically and systemd restarts it (and can escalate via `StartLimitBurst`/`StartLimitAction`) if it goes silent — or a process supervisor (**supervisord**) on the VM. Layer the durable-execution engine ON TOP so that when a worker dies and restarts, in-flight tasks resume from their last journaled step rather than restarting from zero — this is the decisive advantage over a bare cron-restart, which only relaunches the process and loses in-flight state. For containerized workers, use GKE/Cloud Run health checks + restart policies. Keep the cron watchdog only as a last-resort liveness backstop.

## Recommendations

**Stage 1 — Weekend MVP (scaffold orchestration core + 4 stubbed agents):**

- Build a custom asyncio orchestrator implementing the plan→execute→review 3-pass loop, with **Redis Streams** as the event/memory bus and **Dramatiq** for worker task execution. Postgres for state.
- Define the **base Agent contract** (below) and stub the 4 agents (Research, ML, Marketing, CommitGuard) so each runs the 3-pass loop against a no-op tool and publishes events to the bus.
- Wire **Gemini 2.5 Flash-Lite** as the single default model (cheapest), with a routing hook stubbed for later escalation.
- Add **Langfuse** tracing from line one (instrument via OpenLLMetry spans).
- Run workers under **systemd `Restart=always`** on a single GCP VM. Cron watchdog as backstop.

**Stage 2 — Durability & safety (weeks 2–4):**

- Replace the asyncio orchestrator's persistence with **DBOS** (in-process, Postgres) so the 3-pass loop becomes durable steps that resume after crash. Keep Redis Streams as the bus.
- Add tiered model routing (Flash-Lite plan/triage → Sonnet/Gemini Pro execute).
- Introduce **Firecracker/E2B sandboxes** for any agent that executes code (CommitGuard, ML agent).
- Implement scoped per-agent service accounts + GCP Secret Manager + full tool-call audit logging + a killswitch.

**Stage 3 — Scale & harden (months 2–3):**

- Add human-in-the-loop approval gates (DBOS/Temporal suspend-resume) for high-risk actions.
- Add pgvector or Mem0 semantic memory.
- Stand up the **L4 vLLM** node for embeddings + self-hosted CommitGuard triage if volume justifies it; benchmark actual L4 tok/s first.
- Cost attribution dashboards per agent/customer in Langfuse.
- Evaluate migrating DBOS → **Temporal** only if multi-tenant fan-out demands it.

**Thresholds that change the plan:**

- Sustained LLM volume > **~1.3B output tokens/month** AND you can keep an L4 saturated → self-host the high-volume tier on the L4.
- Cross-service/multi-tenant orchestration fan-out grows beyond ~3 services → migrate DBOS → Temporal.
- Event throughput > ~10K msg/s or you need multi-week retention → migrate Redis Streams → NATS JetStream or Kafka.
- Need bus latency < 5ms at p99.9 → Redis Streams or NATS over Kafka.

## Agent Contracts

**Base Agent interface (all agents inherit):**

- Identity & config: `agent_id`, `tenant_id`, scoped service-account credentials, model-tier config, cost/token budget, idempotency key, max retries, killswitch hook.
- `plan(context) → Plan`: cheap model (Flash-Lite) decomposes the goal into steps (durable step 1).
- `execute(plan) → Result`: stronger model + sandboxed tools run each step, fetching ground truth at each (durable step 2).
- `review(result) → Verdict`: evaluator-optimizer loop validates against explicit criteria; on fail, loops back to plan/execute up to N times; high-risk verdicts trigger a human approval gate (durable step 3).
- `read_context() / write_event()`: read/write the Redis Streams memory bus (consumer groups per agent).
- `emit_trace()`: Langfuse span per step tagged with agent ID, tenant ID, token count, and cost.

**Research Agent:** Tools = web search/fetch, RAG over the vector store. Read-only external credentials. Output = structured research artifacts to the bus. Low sandbox needs (no code execution).

**ML Agent:** Tools = the L4 GPU (training/inference), data access. Runs in a GPU-enabled sandbox (gVisor on GKE Sandbox or a Modal-style runner). Scoped read access to datasets, no destructive permissions. Long-running jobs as durable steps with checkpointing so a crash resumes mid-job.

**Marketing Agent:** Tools = content generation (stronger model), social/email APIs (e.g., the available Typefully/Gmail integrations). Scoped per-platform credentials. High-risk publish actions gated behind human approval. Strong audit logging (external-facing actions carry the most reputational blast radius).

**CommitGuard / Security Agent:** Tools = git diff review, secret scanning (TruffleHog/GitGuardian-style patterns), static analysis. Runs continuously on commits. Executes untrusted code review inside a **Firecracker microVM**. Read-only repo access + narrowly scoped write for PR comments. Killswitch + behavioral anomaly detection. Prime candidate for a self-hosted L4 triage model (high volume, privacy-sensitive).

## Non-Functional Requirements

- **Durability:** No task lost on crash; all multi-step workflows resume from last journaled step (RPO ≈ 0 for orchestration state).
- **Availability:** 24/7 agents with auto-restart (systemd/supervisor) + durable resume; target 99.5% at MVP, 99.9% at scale.
- **Idempotency:** Every task carries an idempotency key; steps are replay-safe.
- **Observability:** 100% of agent steps traced with token/cost/latency; per-agent and per-tenant attribution.
- **Security:** Least-privilege scoped credentials per agent; microVM isolation for code exec; full tool-call audit log; killswitch.
- **Cost control:** Per-agent token/cost budgets enforced; tiered routing; cap `max_output_tokens`; prompt caching + batch APIs where possible.
- **Scalability:** Horizontal worker scaling; event bus and durable engine scale independently.

## Open Questions / Risks

- **L4 throughput is unvalidated** — the ~500–1,200 tok/s figure is extrapolated from RTX 4090/A100 benchmarks, not measured on an L4; benchmark before any GPU spend decision.
- **Model pricing/version churn:** prices fell ~10× in two years and models deprecate fast (Gemini 2.0 Flash shut down June 1, 2026). Abstract the model layer behind the router so swaps are config-only; do not anchor cost models on a single deprecating SKU.
- **DBOS → Temporal migration cost:** wrap workflow code behind an interface to keep the migration blast radius to one module; the reverse migration (Temporal → DBOS) is rare enough not to plan for.
- **Prompt injection / agent autonomy:** 24/7 autonomous agents amplify blast radius; treat all inputs as untrusted, gate high-risk actions, never grant global access, and enforce credential compartmentalization across the orchestrator→subagent chain.
- **Cloudflare CPU limits:** 30s default (5 min max) per invocation constrains how much logic runs in Workers/Workflows vs the GCP core.
- **Conflicting break-even claims:** some sources put self-hosting break-even far higher (≈11B tokens/month against budget APIs) when DevOps labor and idle-GPU waste are fully loaded; this reinforces "API until saturated" rather than weakening it.

## Build Roadmap (summary)

- **Weekend MVP:** asyncio orchestrator + Redis Streams + Dramatiq + Postgres; 4 stubbed agents running the 3-pass loop; Gemini 2.5 Flash-Lite default; Langfuse tracing via OpenLLMetry; systemd `Restart=always`.
- **Weeks 2–4:** DBOS durable execution; tiered routing (Flash-Lite → Sonnet/Pro); Firecracker/E2B sandboxes; scoped per-agent creds + GCP Secret Manager + tool-call audit logs + killswitch.
- **Months 2–3:** human-in-the-loop approval gates; pgvector/Mem0 memory; benchmarked L4 vLLM node for embeddings/CommitGuard triage; per-agent/per-tenant cost dashboards; Temporal migration only if multi-tenant fan-out requires it.

## Phase 1: CEO Review

### CLAUDE SUBAGENT (CEO — strategic independence)

1. **Right problem:** Scoping a generalized infra play instead of a vertical app is risky. (User confirmed OS scope).
2. **Premises:** "Weekend MVP" with DBOS+Redis is a complex distributed system.
3. **Regret:** Building custom orchestration when native MCP APIs might make it obsolete.
4. **Alternatives:** Dismissing standard agent frameworks (LangGraph) in favor of custom.
5. **Competitive risk:** Competing on infrastructure vs LangChain, Vercel, Cloudflare.

### CEO DUAL VOICES — CONSENSUS TABLE:

═══════════════════════════════════════════════════════════════
Dimension Claude Codex Consensus
──────────────────────────────────── ─────── ─────── ─────────

1. Premises valid? NO — FLAGGED
2. Right problem to solve? NO — FLAGGED
3. Scope calibration correct? NO — FLAGGED
4. Alternatives sufficiently explored?NO — FLAGGED
5. Competitive/market risks covered? NO — FLAGGED
6. 6-month trajectory sound? NO — FLAGGED
   ═══════════════════════════════════════════════════════════════
   _(Note: Codex unavailable. User explicitly confirmed the premise to keep the Agent Mesh OS scope)._

### What already exists

- Weekend MVP Orchestration -> existing DBOS integration in `main.py`
- Frontend Dashboard -> existing `dashboard.html` with SSE streaming
- Tool execution sandbox -> existing E2B integration in `CommitGuardAgent`
- Multi-model dispatch -> existing dispatcher in `api.py`

### NOT in scope

- Self-hosting L4 GPUs for local models (Deferred to avoid ops distraction).
- Native Temporal migration (Deferred; stick with DBOS for now).

### Error & Rescue Registry

| Error                | Rescue Mechanism                              |
| -------------------- | --------------------------------------------- |
| Agent crash          | systemd `Restart=always`                      |
| Orchestrator restart | DBOS durable execution resumes from last step |

### Failure Modes Registry

| Component           | Failure Mode                                  | Auto-Decision Fix                                                    |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| DBOS                | Abstraction leak in future Temporal migration | Accepted (P6 - bias toward action, stick to DBOS).                   |
| Custom Orchestrator | Native API obsolescence                       | Accepted (P5 - explicit over clever, build custom to own the stack). |

### Dream State Delta

```
CURRENT                    THIS PLAN                           12-MONTH IDEAL
weekend scripts   --->     durable execution + Redis Streams ---> fully managed cluster
local LLMs        --->     API routing (Flash-Lite + Sonnet) ---> self-hosted specialized models
print() debugging --->     Langfuse + SSE Dashboard          ---> cross-tenant multi-agent orchestration
```

### CEO Completion Summary

- **Plan Status:** REVIEWED (CEO Phase)
- **Scope Calibration:** SELECTIVE EXPANSION
- **Premises:** CONFIRMED BY USER
- **Risks Flagged:** Custom orchestration vs off-the-shelf, DBOS lock-in.

<!-- AUTONOMOUS DECISION LOG -->

## Decision Audit Trail

| #   | Phase | Decision                                | Classification | Principle       | Rationale                                             | Rejected         |
| --- | ----- | --------------------------------------- | -------------- | --------------- | ----------------------------------------------------- | ---------------- |
| 1   | CEO   | Drop 3 agents and pivot to vertical app | User Challenge | Human           | User confirmed Agent Mesh OS scope over vertical app. | N/A              |
| 2   | CEO   | Include Langfuse & E2B from Day 1       | Mechanical     | P2 (Boil Lakes) | In blast radius, <1d effort, high leverage.           | Defer to Month 2 |
| 3   | CEO   | Drop self-hosted L4 GPUs                | Mechanical     | P3 (Pragmatic)  | High ops overhead for MVP.                            | Keep in roadmap  |

## Phase 2: Design Review

### CLAUDE SUBAGENT (Design — independent review)

1. **Information Hierarchy:** Missing hierarchy. Need Primary (Actionable/Health), Secondary (Live streams), Tertiary (Config).
2. **Missing States:** No UI states mapped to execution states (Idle, Planning, Executing, Blocked, Failed, Success).
3. **User Journey:** Approval gates break the emotional arc of autonomous execution. Need async notifications (Slack/webhook).
4. **Specificity:** Generic modals for approval. Need bespoke UI (git diff for CommitGuard, WYSIWYG for Marketing).
5. **Ambiguous Design:** Killswitch must be a persistent global red toggle, not buried.

### DESIGN LITMUS SCORECARD (Consensus Table)

═══════════════════════════════════════════════════════════════
Dimension Claude Codex Consensus
──────────────────────────────────── ─────── ─────── ─────────

1. Information hierarchy clear? NO — FLAGGED
2. Interaction states defined? NO — FLAGGED
3. Emotional journey unbroken? NO — FLAGGED
4. Specificity in UI components? NO — FLAGGED
5. Critical/danger paths clear? NO — FLAGGED
   ═══════════════════════════════════════════════════════════════
   _(Note: Codex unavailable. All Claude design findings accepted via P1 - Choose completeness and P5 - Explicit over clever)._

### Design Decisions Auto-Decided

- **Hierarchy Fix:** Approved. Global health & approvals on top, live streams in middle, config at bottom.
- **State mapping:** Approved. Add UI badges for `Idle`, `Planning`, `Executing`, `Blocked`, `Failed`, `Success`.
- **Async Notifications:** Approved. Add webhook skeleton for approval gating.
- **Bespoke Approval UI:** Approved. Add diff viewer constraint for CommitGuard.
- **Global Killswitch UI:** Approved. Must be a persistent header toggle.

### Design Completion Summary

- **Plan Status:** REVIEWED (Design Phase)
- **Completeness:** 4/10 initial -> 8/10 post-review
- **Risks Flagged:** Async notifications are required for true autonomy, or users will babysit the dashboard.

<!-- AUTONOMOUS DECISION LOG -->

| 4 | Design | Add explicit information hierarchy | Mechanical | P5 (Explicit) | Hierarchy was undefined. | Keep undefined |
| 5 | Design | Map backend states to UI states | Mechanical | P1 (Completeness) | Edge cases/states were missing. | Leave missing |
| 6 | Design | Require webhook for approvals | Taste | P2 (Boil Lakes) | In blast radius, fixes the core emotional arc. | Defer to MVP2 |
| 7 | Design | Bespoke approval UI (git diff) | Mechanical | P5 (Explicit) | Generic JSON is unreadable for git diffs. | Generic JSON modal |
| 8 | Design | Global persistent Killswitch UI | Mechanical | P1 (Completeness) | Critical danger path was undefined. | Buried setting |

## Phase 3: Eng Review

### CLAUDE SUBAGENT (Eng — independent review)

1. **Architecture:** Leaky durable execution abstraction. Split-brain state between DBOS (Postgres) and Redis Streams.
2. **Edge Cases:** Redis OOM risk without MAXLEN. Missing Dead Letter Queue (DLQ) for retries.
3. **Tests:** Infinite LLM loop risk. Missing prompt evals, chaos tests, and hard cost caps.
4. **Security:** Sandbox egress risks (attackers could exfiltrate tokens via `curl`).
5. **Hidden Complexity:** Long-running suspended workflows (HITL) versioning pain. Tiered routing impedance mismatch.

### ENG LITMUS SCORECARD (Consensus Table)

═══════════════════════════════════════════════════════════════
Dimension Claude Codex Consensus
──────────────────────────────────── ─────── ─────── ─────────

1. Architecture sound? NO — FLAGGED
2. Test coverage sufficient? NO — FLAGGED
3. Performance risks addressed? NO — FLAGGED
4. Security threats covered? NO — FLAGGED
5. Error paths handled? NO — FLAGGED
6. Deployment risk manageable? NO — FLAGGED
   ═══════════════════════════════════════════════════════════════
   _(Note: Codex unavailable. All Claude eng findings accepted via P5 - Explicit over clever and P1 - Completeness)._

### Architecture (ASCII Dependency Graph)

```text
[User] --> [Dashboard UI (FastAPI/SSE)]
                 |
        [DBOS Orchestrator] <---- (Replaces Redis Streams entirely)
           /             \
  [Agent: Flash-Lite]  [Agent: Sonnet/Pro]
           \             /
       [E2B Sandboxes (Egress Locked)]
```

### What already exists

- Orchestrator entrypoints (`main.py`, `api.py`) -> DBOS setup
- Tool mockups -> E2B Python sandbox integration

### NOT in scope

- Dual-writing to Redis Streams (Deferred to avoid split-brain, stick to DBOS Postgres).
- Tiered routing between different model families (Stick to Flash/Pro within Gemini or Anthropic to avoid schema mismatch).

### Failure Modes Registry

| Component | Failure Mode           | Auto-Decision Fix                                 |
| --------- | ---------------------- | ------------------------------------------------- |
| DBOS      | Split-brain with Redis | Drop Redis Streams. Use DBOS messaging.           |
| Redis     | OOM without MAXLEN     | N/A (Dropping Redis).                             |
| Sandbox   | Exfiltration via curl  | Add strict egress proxies (whitelist github.com). |
| Agent     | Infinite loop          | Add system-level token/cost caps + DLQ.           |
| HITL      | Suspended workflow rot | 24h auto-reject timeout on HITL.                  |

### Eng Decisions Auto-Decided

- **Architecture:** Drop Redis Streams to prevent split-brain. DBOS exclusively.
- **Edge cases:** Added Dead Letter Queue (DLQ) & backoffs.
- **Tests:** Mandated system-level token caps and chaos DBOS testing.
- **Security:** Strict egress proxy on Firecracker.
- **Complexity:** 24-hour timeout on all HITL workflows to prevent version rot.

### Eng Completion Summary

- **Plan Status:** REVIEWED (Eng Phase)
- **Completeness:** 5/10 initial -> 9/10 post-review
- **Risks Flagged:** Egress proxy configuration is critical for CommitGuard security.

<!-- AUTONOMOUS DECISION LOG -->

| 9 | Eng | Drop Redis Streams for DBOS native | Mechanical | P5 (Explicit) | Prevents split-brain state. | Keep Redis |
| 10 | Eng | Egress proxy on E2B | Mechanical | P1 (Completeness) | Critical security hole. | Full internet access |
| 11 | Eng | 24h HITL timeout | Mechanical | P3 (Pragmatic) | Prevents workflow versioning hell. | Infinite sleep |

## Phase 3.5: DX Review

### CLAUDE SUBAGENT (DX — independent review)

1. **Getting Started (TTHW):** No defined TTHW.
2. **API/CLI ergonomics:** Base Agent interface violates progressive disclosure (too many required args).
3. **Error handling:** No standard for developer-facing errors.
4. **Documentation:** Missing docsite, examples, IA.
5. **Escape hatches:** Framework is overly rigid (DBOS exclusivity, hard timeouts).

### DX DUAL VOICES — CONSENSUS TABLE

═══════════════════════════════════════════════════════════════
Dimension Claude Codex Consensus
──────────────────────────────────── ─────── ─────── ─────────

1. Getting started < 5 min? NO — FLAGGED
2. API/CLI naming guessable? NO — FLAGGED
3. Error messages actionable? NO — FLAGGED
4. Docs findable & complete? NO — FLAGGED
5. Upgrade path safe? NO — FLAGGED
6. Dev environment friction-free? NO — FLAGGED
   ═══════════════════════════════════════════════════════════════
   _(Note: Codex unavailable. Claude DX findings accepted via P5 - Explicit over clever and P1 - Completeness)._

### Developer Journey Map

| Stage              | Experience                        | Goal                                  |
| ------------------ | --------------------------------- | ------------------------------------- |
| 1. Discover        | Reads README.md                   | Understand Agent Mesh OS value prop   |
| 2. Install         | `pip install agentmesh`           | 0 friction                            |
| 3. Hello World     | `agentmesh init`                  | < 1 min to running agent              |
| 4. Core Concepts   | Learn `plan -> execute -> review` | Clear mental model                    |
| 5. Advanced Config | Add DBOS/tenant config            | Progressive disclosure                |
| 6. Debugging       | Hit first error                   | Actionable error msg (Prob+Cause+Fix) |
| 7. Deployment      | Run in production                 | Easy DBOS migration guide             |
| 8. Scaling         | Multi-agent workflows             | Predictable limits                    |
| 9. Escape Hatch    | Override core routing             | Clean interface to bypass             |

### Developer Empathy Narrative

_As a developer, I just want my agent to run 24/7 without baby-sitting it. But when I open this repo, I am bombarded with DBOS, Redis Streams, Dramatiq, and Firecracker before I can even write a prompt. I need a single `agentmesh init` command that hides this complexity until I need it. When things break, tell me how to fix it, do not just dump a stack trace._

### DX Scorecard

1. TTHW (0-10): 2
2. API Ergonomics (0-10): 3
3. Error Actionability (0-10): 2
4. Documentation (0-10): 1
5. Escape Hatches (0-10): 3
6. Debuggability (0-10): 5
7. Upgrade Safety (0-10): N/A
8. Friction (0-10): 3
   **Overall DX Score: 2.7/10** (Target: 8/10)

### TTHW Assessment

- **Current TTHW:** Unknown (requires manual scaffolding of DBOS/Postgres).
- **Target TTHW:** < 5 minutes.
- **Fix:** Add `agentmesh init` CLI scaffold.

### DX Implementation Checklist

- [ ] Implement `agentmesh init` CLI for local SQLite/Postgres.
- [ ] Refactor `BaseAgent` constructor to require only `goal` and `model`.
- [ ] Create standardized framework exception class (Problem + Cause + Fix).
- [ ] Build docs site scaffolding (Concepts, Guides, Reference).
- [ ] Add `ModelClient` interface escape hatch for unsupported LLMs.

### DX Completion Summary

- **Plan Status:** REVIEWED (DX Phase)
- **Completeness:** 2.7/10 initial -> 8/10 post-review targeted
- **Risks Flagged:** Heavy upfront infrastructure requirements kill adoption.

<!-- AUTONOMOUS DECISION LOG -->

| 12 | DX | Add CLI init scaffold | Mechanical | P5 (Explicit) | Simplifies TTHW to <5m. | Require manual setup |
| 13 | DX | Progressive disclosure on Agent | Taste | P5 (Explicit) | Reduces cognitive load. | Explicit config |
| 14 | DX | Standardized Error exceptions | Mechanical | P1 (Completeness) | Improves debuggability. | Raw stack traces |
| 15 | DX | Add ModelClient escape hatch | Taste | P3 (Pragmatic) | Prevents lock-in frustration. | Rigid routing |

## Cross-Phase Themes

1. **Infrastructure Gravity vs UX**: The plan was heavily skewed toward infrastructure and backend state engines. Both the Design and DX phases surfaced that without a seamless UI (webhooks, state badges, bespoke diff viewers) and an easy CLI (`agentmesh init`), the robust backend will be unusable.
2. **State Management Friction**: The conflict between Redis Streams and DBOS was identified by the Eng subagent and resolved by dropping Redis Streams to rely entirely on Postgres/DBOS, centralizing state and reducing split-brain risk.
