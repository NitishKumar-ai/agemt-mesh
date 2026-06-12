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

## CriticGate — Phase 6
- Run the eval with the real LLM deep-probe: `CRITICGATE_REAL_PROBE=1` + `MODEL_CRITIC` env var — wired and stub-verified in Phase 5, needs an Anthropic/Gemini API key to produce real numbers.
- Strategy D red team: LLM-generated backdoors (the scripted A–C set saturates at 1.000 safety against the simulated probe and no longer stresses the monitor).
