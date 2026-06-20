# Company Knowledge OS - Phase 2 (MVP)

AI Native Company Knowledge Operating System - Episode and Fact Memory System

## Overview

This is the MVP implementation of a company knowledge operating system that ingests content from multiple sources, extracts entities and facts, and provides hybrid retrieval for AI-powered workflows.

## Architecture

```
company-knowledge-os/
├── packages/
│   ├── core/                    # Domain models and interfaces
│   │   ├── models/              # Tenant, Episode, Fact, Entity
│   │   └── interfaces/          # Connector interface
│   ├── database/                # PostgreSQL with pgvector
│   │   ├── schema/              # Database schema
│   │   ├── dao/                 # Data access objects
│   │   └── migrations/          # Database migrations
│   ├── ingestion/               # Ingestion orchestrator
│   │   └── orchestrator.ts      # Job queue and processing
│   ├── extraction/              # Entity extraction pipeline
│   │   └── entity-extractor.ts  # Two-pass extraction
│   ├── retrieval/               # Hybrid search (coming)
│   ├── api/                     # REST API (coming)
│   ├── workflows/               # First-party workflows (coming)
│   ├── connector-slack/         # Slack connector
│   ├── connector-gdrive/        # Google Drive connector
│   ├── connector-gmail/         # Gmail connector
│   ├── connector-notion/        # Notion connector
│   └── connector-github/        # GitHub connector
├── turbo.json
└── package.json
```

## Installation

```bash
pnpm install
```

## Development

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Run development servers
pnpm dev
```

## Project Status

### Completed (Phase 2.1)

- [x] Project structure and base packages
- [x] Tenant model and interfaces
- [x] Episode store and models
- [x] Connector framework with interfaces
- [x] All 5 connectors (Slack, GDrive, Gmail, Notion, GitHub)
- [x] Ingestion orchestrator with Bull queue
- [x] Entity extraction pipeline
- [x] PostgreSQL schema with pgvector

### In Progress

- [ ] Hybrid retrieval (vector + full-text search)
- [ ] Q&A service with grounded generation
- [ ] First-party workflows (onboarding + weekly digest)
- [ ] Comprehensive tests

## Configuration

Create a `.env` file:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/knowledge-os
REDIS_URL=redis://localhost:6379

# Connectors
SLACK_TOKEN=xoxb-...
GDRIVE_CLIENT_ID=...
GDRIVE_CLIENT_SECRET=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
NOTION_TOKEN=secret-...
GITHUB_TOKEN=ghp-...

# OpenAI (for embeddings and LLM)
OPENAI_API_KEY=sk-...
```

## Roadmap

See `~/.commandcode/plans/company-knowledge-os-phase2.md` for detailed implementation plan.

## License

ISC