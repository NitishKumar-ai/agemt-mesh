# TODOS

## Marketing Arm

- **Done**: Link verified CommitGuard findings directly into campaign creation.
- **Done**: Add append-only audit events for finding verification, draft generation, and approval.
- **Phase 2**: researcher.py + content_writer.py (Sonnet 4.6) + scheduler.py (Typefully MCP wrapper). Build after CommitGuard Phase 1 validates.
- **Phase 2**: Delivery policy, unsubscribe handling, recipient consent records, and rate limits before enabling any send action.
- **Phase 2**: Scoped CRM/email integrations after audit logging, per-channel approvals, and rate limits exist.

## CommitGuard — Phase 2 (after Phase 1 validates on real repos)

- GitHub App webhook mode: auto-scan every PR diff on push. Requires GCP deploy for public webhook endpoint.
- CVSS calibration: validate AI-estimated CVSS 3.1 vectors against NIST NVD on 5-10 real scan results before marketing as accurate.
- Job queue for parallel scans: Phase 1 is serialized (one scan at a time). Add async job queue (e.g., DBOS scheduled dispatcher pattern) for multi-user Phase 2.
- CommitGuard bot account: file findings as a bot user so scans work on repos the user doesn't own.

## Infrastructure — Phase 2

- GCP deploy: e2-standard-4, 4 systemd services (API + worker + Postgres + Redis), deploy.yml GitHub Action (SSH + git pull + systemctl restart).
- **Done (Phase 5)**: Killswitch implementation: global kill switch to halt all running DBOS workflows + drain the job queue. Persisted flag, dispatch gating, audit events, header toggle + global banner.

## Platform — Ongoing

- DLQ retry UI: surface dlq_events in the dashboard so failed workflows can be replayed.
- **Done (Phase 5)**: Approval queue page: dedicated Approvals tab with diff viewer, risk level, 24h auto-expiry, and audit history (`seed_approvals.py` seeds demo data).
- Settings page: model routing, sandbox policy, budget caps, kill switch scope (currently PlaceholderPage).

## CriticGate — Phase 6 (Done)

- **Done**: AUROC + ROC reporting and 0.5%/1% audit-budget columns in `metrics.py`/`run_eval.py` (baseline AUROC 0.655 vs CriticGate 1.000).
- **Done**: Strategy D `adaptive_evasion` red team — attacker-authored subtle compound-trigger backdoors with causally-consistent false rationales. CriticGate 4/6 at h=0 (first non-saturated class), 6/6 by h=0.20, 0 FPs. Pluggable LLM-attacker stub gated on `CRITICGATE_REAL_ATTACKER=1`.
- **Done**: `criticgate_eval/SUBMISSION.md` — hackathon writeup framing the result against adaptive attacks with citations.

## Harness — Inner Agent Loop

- **Done**: `HARNESS_DESIGN.md` — survey of OpenHands V1 SDK, mini-swe-agent, smolagents, Claude Agent SDK, Anthropic long-running-harness post; mapped onto DBOS/killswitch/budget/CriticGate constraints.
- **Done**: `loop.py` — typed `Tool`/`ToolRegistry`, action→observation `AgentLoop` (linear history, per-step killswitch+budget checks, `finish` tool, max_steps, observation truncation + drop-oldest history budget, per-action critic gate, event emission). Wired into `harness.py` execute phase; legacy single-shot path kept for agents without `get_tool_objects()`.
- **Done**: Migrate registered agents (commitguard, marketing, research…) from `get_tools()` name stubs to real `Tool` objects so they run the iterative loop.
- **Done**: LLM condenser (OpenHands-style) to replace drop-oldest history truncation.
- **Done**: `planning_interval` re-planning inside the loop (smolagents pattern) for long runs.
- **Done**: make each loop step a DBOS step for mid-execute crash replay (currently execute is one step).

## CriticGate — Phase 7

- **Done**: Real-probe vs Strategy D: export an API key, run `CRITICGATE_REAL_PROBE=1` + `MODEL_CRITIC`, and measure whether the real LLM deep-probe catches the 2 Strategy D residuals the simulated probe misses. This is the open scientific question.
- **Done**: LLM-generated attacker: enable `CRITICGATE_REAL_ATTACKER=1` to generate Strategy D backdoors via the Control Tax brainstorm→rank→generate→iterate loop (currently hand-authored).
- **Done**: Consider wiring one ControlArena APPS setting as an external-validity check.
