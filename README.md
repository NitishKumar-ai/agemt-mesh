# AgentMesh

An autonomous, durable agent mesh built on a TypeScript port of the Netflix Conductor workflow engine.

## Overview

This project is a high-performance, durable workflow engine designed to power a **24/7 autonomous agent mesh**. It enables complex, long-running agentic loops (plan → execute → review) with built-in human-in-the-loop gates, global killswitches, and secure sandboxing.

### Key Features

- **Durable Agent Workflows**: Workflows survive process restarts and can run for months.
- **AI-First Engine**: Native `LLM_CHAT_COMPLETE` and `LLM_GENERATE_EMBEDDINGS` system tasks with tiered provider routing (Anthropic, Gemini).
- **Secure Sandboxing**: Integrated E2B Code Interpreter for safe, egress-controlled code execution.
- **Observability**: Live SSE dashboard for agent events and system status.
- **Safety**: Global emergency killswitch and token budget enforcement.

## Prerequisites

- **Node.js 20+**
- **pnpm 9+**
- **Docker** (optional, for PostgreSQL/Redis)

## Getting Started

### Installation

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Running the Server

To start the `server-lite` runtime (SQLite-backed):

```bash
cd server-lite
pnpm start
```

The server will be available at `http://localhost:8080`.
The live dashboard is available at the root: `http://localhost:8080/index.html`.
Swagger documentation is available at `http://localhost:8080/api/docs`.



## Development

- **Linting**: `pnpm lint`
- **Testing**: `pnpm test`
- **Format**: `pnpm format`


