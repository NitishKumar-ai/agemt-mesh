# Agent Mesh OS

Welcome to your Agent Mesh OS project. This project provides a durable, multi-agent orchestration layer built on top of [DBOS](https://github.com/dbos-inc/dbos-transact) and Python, allowing you to string together LLM agents (e.g. Researcher, Coder) via reliable execution workflows.

## Architecture: The 3-Pass Loop

Each Agent in the mesh executes a strictly orchestrated 3-pass loop for every task:

1. **Plan**: Given a context, the Agent invokes an LLM to generate a structured `Plan`.
2. **Execute**: The Agent executes the plan. For the `CommitGuardAgent`, this involves generating executable Python code and running it securely in an **E2B Sandbox**.
3. **Review**: The Agent reviews the output and generates a `Verdict`.

All steps are durably executed and automatically retried by DBOS in case of transient failures (network timeouts, API limits). Agent state and events are persisted to a PostgreSQL database and broadcast over Redis streams.

## Getting Started

Follow these steps to initialize and run the Agent Mesh:

### 1. Configure Environment
```bash
mv .env.example .env
# Edit .env and fill in your OPENAI_API_KEY, ANTHROPIC_API_KEY, and E2B_API_KEY
```

### 2. Start Infrastructure (PostgreSQL & Redis)
```bash
docker-compose up -d
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the CLI Demo
```bash
make demo
```

### 5. Launch the Web Dashboard
```bash
uvicorn api:app --reload
# Open http://127.0.0.1:8000 in your browser
```

## Observability

This project includes OpenLLMetry (`traceloop-sdk`) out of the box to export standard OTEL traces for LLM calls.
To integrate with Langfuse or LangSmith:

1. **Langfuse**: Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in your `.env`. Traceloop will automatically export to Langfuse.
2. **LangSmith**: Set `TRACELOOP_BASE_URL="https://api.smith.langchain.com"` and `TRACELOOP_HEADERS="x-api-key=YOUR_API_KEY"`.

## Troubleshooting

### "Docker is not running" or "Connection Refused"
- **Cause**: PostgreSQL or Redis is not reachable.
- **Fix**: Ensure Docker desktop is running and `docker-compose up -d` was executed successfully.

### "AuthenticationError" from LLM Provider
- **Cause**: Missing or invalid API key.
- **Fix**: Verify your `.env` contains valid keys (e.g., `OPENAI_API_KEY`) and they are loaded correctly.

### "E2B Execution Failed"
- **Cause**: Missing `E2B_API_KEY` or networking block.
- **Fix**: Verify your E2B API key in `.env`. Ensure your host can establish outbound WebSocket connections.
