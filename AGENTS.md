# AGENTS.md

Instructions for AI coding agents working on the AgentMesh codebase.

## Project Overview

AgentMesh is an open-source, distributed workflow orchestration engine designed for microservices.
It uses a pluggable architecture with interface-based abstractions for persistence, queuing, and indexing.
The project is a TypeScript monorepo managed by `pnpm`.

## Setup Commands

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `pnpm build`      | Build the entire project        |
| `pnpm test`       | Run all tests                   |
| `pnpm lint`       | Run linting checks              |
| `pnpm lint --fix` | Apply code formatting fixes     |

## Code Style

- AgentMesh is pluggable: when introducing new concepts, always use an **interface-based approach**
- Core interfaces and domain models are defined in `@agentmesh/core` or `@agentmesh/common`
- Follow existing patterns in the codebase for consistency
- Do not use emojis such as ✅ in the code, logs, or comments. Keep comments professional
- When adding new logic, comment the algorithm, design, etc.

## Architecture Guidelines

### Module Structure

- **core**: Contains interfaces, domain models, and core business logic
- **common**: Shared utilities and base models
- **ai**: AI provider integrations (Anthropic, Gemini, etc.)
- **agent-runtime**: Agent execution logic and worker pools
- **rest**: NestJS controllers and API definitions
- **server-lite**: Lightweight server entry point using SQLite
- **persistence modules**: Implementations of DAO interfaces (sqlite, postgres, redis, etc.)
- **ui**: Agent Mesh React and TypeScript operator console
- **ui-next**: Legacy workflow orchestration UI and component library

### Key Patterns

- DAOs are defined as interfaces/abstract classes and implemented in persistence modules
- System tasks are registered in the `SystemTaskRegistry`
- Configuration is handled via environment variables (see `.env.example`)

## Testing

- **Avoid mocks**: Use real implementations whenever possible
- **Test actual behavior**: Tests must verify real implementation logic, not duplicate it
- **Use Vitest**: The project uses Vitest for unit and integration testing
- **Cover concurrency**: Ensure async scenarios are tested
- **Run tests before submitting**: `pnpm test` must pass

### Test Locations

- Unit tests: `test/` or `src/**/*.test.ts` in each module
- E2E tests: `e2e` or specialized test modules

## PR Guidelines

- Submit PRs against the `main` branch
- Use clear, descriptive commit messages
- Run `pnpm lint` and `pnpm test` before pushing
- Add or update tests for any code changes
- Keep PRs focused—one logical change per PR

## Security Considerations

- Never commit secrets, API keys, or credentials
- Be cautious with external dependencies—prefer well-maintained libraries
- Follow secure coding practices for input validation and error handling
- Review [SECURITY.md](SECURITY.md) for vulnerability reporting procedures

## Writing Documentation

Documentation in this project is **derived from source**, not composed from memory. Open the source first, read what's there, then write the doc from what you find. The source is the spec; the doc is a rendering of it.

### Workflow for each content type

**REST API endpoint or curl example**

1. Open the relevant controller in `rest/src/controllers/`
2. Find the method using its `@Post()`, `@Get()`, etc. decorators — copy the path literally.
3. Read the method signature for query params, path variables, and request body type.
4. Write the curl command from what you just read.

**SDK code example (TypeScript)**

1. Open the relevant source file in `agent-runtime/` or `core/`.
2. Find the method signature and required parameters.
3. Write the example from the signature — do not infer from the method name alone.
4. If a working test exists for that method, use it as the starting point.

**Expected output block**

1. Get real output: run the command locally, or find it in test fixtures, CI logs, or existing tests.
2. Paste verbatim. Do not paraphrase or construct output that "looks right."
3. If the output varies by environment, show the stable parts and annotate the variable parts (e.g., `<workflow-id>`).

## Agent Behavior

- **Prefer automation**: Execute requested actions without confirmation unless blocked by missing info or safety concerns
- **Use parallel tools**: When tasks are independent, execute them in parallel for efficiency
- **Verify changes**: Always run tests and lint before considering work complete
