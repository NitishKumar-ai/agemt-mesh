# AgentMesh Server Configuration

AgentMesh uses **environment variables** for all configuration. There are no
property files to manage.

## Required Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | `production` or `development` |
| `DB_PATH` | `./data/agentmesh.sqlite` | SQLite database file path (when using SQLite) |

## Database

SQLite is the default. To use PostgreSQL, set these variables:

| Variable | Example | Description |
|----------|---------|-------------|
| `DB_TYPE` | `postgres` | Switch to PostgreSQL |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `agentmesh` | PostgreSQL user |
| `DB_PASS` | `agentmesh` | PostgreSQL password |
| `DB_NAME` | `agentmesh` | PostgreSQL database name |

## AI Providers

At least one AI provider key is needed for agent tasks:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `E2B_API_KEY` | E2B sandbox execution API key |

## Queue Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_PROVIDER` | `sqlite` | Queue backend: `sqlite` or `rabbitmq` |
| `RABBITMQ_URL` | `amqp://localhost:5672` | RabbitMQ connection URL |

## Observability (Langfuse)

| Variable | Description |
|----------|-------------|
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | Langfuse endpoint (default: `https://cloud.langfuse.com`) |

## Example

```bash
export PORT=8080
export DB_PATH=./data/agentmesh.sqlite
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AI...
node server-lite/dist/index.js
```

See `.env.example` in the project root for a copy-pasteable template.
