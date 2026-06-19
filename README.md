# Agent Mesh OS

The 24/7 autonomous agent mesh orchestrated on top of **DBOS**, designed for durability, observability, and human-in-the-loop safety.

## Overview
Agent Mesh OS shifts agent architecture away from volatile, transient task queues toward **durable execution**. Rather than losing state when an agent crashes or pauses for human approval, the orchestration engine persists every step. 

The primary MVP ships with a Git security agent (`CommitGuardAgent`), designed to review commits in isolated Firecracker sandboxes (via **E2B**).

## Key Features

1. **Durable Execution Backbone:** Powered natively by `dbos-transact` (Postgres / SQLite). Multi-step Agent plan->execute->review loops are completely resume-able.
2. **Human-in-the-Loop Approval Webhooks:** High-risk actions automatically suspend the agent. Approving the action via dashboard or webhook will unblock the agent seamlessly.
3. **Firecracker Code Sandbox:** Any code execution is isolated using E2B microVMs, fully neutralizing malicious LLM behavior.
4. **Langfuse Observability:** Integrated with `traceloop-sdk` for one-line OpenTelemetry exporting directly into Langfuse dashboards.
5. **Real-time UI Dashboard:** Web UI powered by FastAPI and Server-Sent Events (SSE) streaming, connected to an in-memory or Postgres Event Bus.

## Quickstart

### 1. Install Dependencies

**Backend (Python):**
```bash
py -m pip install -r requirements.txt
# Linux/macOS: pip install -r requirements.txt
```

**Frontend (Node.js):**
```bash
cd frontend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys (GEMINI_API_KEY, ANTHROPIC_API_KEY, etc.)
```

The FastAPI app loads `.env` automatically on startup.

### 3. Scaffold DBOS Database
```bash
py -m dbos migrate
py setup_dlq.py
# Linux/macOS: dbos migrate && python setup_dlq.py
```

### 4. Start Backend and Frontend

Run these in **two separate terminals** from the repo root:

**Terminal 1 — Backend (FastAPI on port 8000):**
```bash
py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
# Linux/macOS: uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend (Vite dev server on port 5173):**
```bash
cd frontend
npm run dev
```

Open **http://127.0.0.1:5173/** for the UI. The Vite dev server proxies `/api`, `/stream`, and `/webhook` to the backend at `http://127.0.0.1:8000`.

| Service  | URL                      | Command |
|----------|--------------------------|---------|
| Frontend | http://127.0.0.1:5173/   | `cd frontend && npm run dev` |
| Backend  | http://127.0.0.1:8000/   | `py -m uvicorn api:app --reload --host 127.0.0.1 --port 8000` |

### 5. Production Frontend Build

To build the frontend for FastAPI to serve:

```bash
cd frontend
npm run build
```

When `frontend/dist` exists, FastAPI serves it at `/`; otherwise it falls back to the legacy `dashboard.html`.

## Connect GitHub

Agent Mesh uses a GitHub OAuth App to connect an account, list accessible repositories, and import selected repositories into the workspace.

1. Create an OAuth App at `https://github.com/settings/developers`.
2. Set the homepage URL to `http://127.0.0.1:5173`.
3. Set the authorization callback URL to `http://127.0.0.1:8000/api/github/callback`.
4. Copy `.env.example` to `.env` and provide the OAuth client ID, client secret, and a Fernet encryption key.
5. Restart the backend after editing `.env` (FastAPI loads it on startup).

Generate the token-encryption key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

The default OAuth scope is `read:user repo`, which allows importing public and private repositories. GitHub OAuth App scopes are broad; a GitHub App with repository-by-repository installation access is the recommended next hardening step for a multi-user deployment.

## Marketing Arm

The first marketing-arm implementation converts verified security findings into responsible campaign drafts.

- Campaigns require an explicit audience and verified finding.
- Draft generation is constrained to supplied evidence and cannot invent impact or urgency.
- External-facing copy remains in `review_required` until a human approves it.
- The current implementation does not discover personal contacts or send outreach.

Open the `Marketing` workspace in the TypeScript frontend to create, generate, and approve campaigns.

### CommitGuard to Marketing Handoff

Marketing campaigns must now reference a verified security finding:

1. CommitGuard or another trusted scanner creates a finding with `POST /api/security/findings`.
2. An operator reviews the evidence and verifies it with `POST /api/security/findings/{id}/verify`.
3. The Marketing workspace uses the verified finding to prefill a campaign.
4. Draft generation and campaign approval remain separate human-controlled steps.

Unverified findings and manually entered evidence cannot create campaigns.

## Configuration
Optionally configure your API keys by creating a `.env` file or exporting them to your environment:
- `GEMINI_API_KEY` (Required for Gemini agent execution)
- `ANTHROPIC_API_KEY` (Required for Claude agent execution)

## Advanced Capabilities

### Recursive Delegation
All agents in the mesh are now **Recursive**. Every agent inherits the `delegate_task` tool, allowing it to spawn specialized subagents (or another instance of itself) to solve complex sub-problems. This enables hierarchical problem solving and role-based orchestration.

### Code-Native Execution
Advanced agents like `MLInternAgent` support **Code-Native tool use**, executing Python scripts in secure E2B sandboxes for advanced data processing and reasoning.

### Performance Benchmarking
Agent Mesh now includes a performance benchmarking suite in `benchmarks/run_benchmarks.py`. This suite measures agent latency, token usage, and cost per task, ensuring optimal orchestration and model routing.
- `E2B_API_KEY` (Required for firecracker code sandboxes; mocks gracefully if omitted)
- `TRACELOOP_API_KEY` (Required for Langfuse trace exporting; mocks gracefully if omitted)

## Architecture
For deep architectural guidelines and decisions (Durable vs Temporal, Model Routing, Event Bus), please read [ARCHITECTURE.md](ARCHITECTURE.md).
