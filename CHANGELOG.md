# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0.1] - 2026-06-20

### Added
- Added `zod-proto-gen` package for introspecting Zod schemas and converting them to Protobuf declarations.
- Integrated `HttpTask` and `JsonJqTransform` system tasks into the server-lite runtime.
- Added conditional check for AMQPQueueDAO in server-lite based on `QUEUE_PROVIDER=amqp`.
- Added unit tests for `findZodSchemas` in `zod-proto-gen` with passing status.

### Fixed
- Fixed critical shadowing bug in `WorkflowExecutorOps.scheduleTask` preventing non-system tasks from being queued and executed.
- Fixed TS compilation errors in `zod-proto-gen` package due to ZodTypeDef type assertions and CLI arguments.
- Fixed SQLite WAL journal mode pragma to only apply when DB path is not `:memory:`.

## [0.1.0.0] - 2026-06-18

### Added

- TypeScript implementation of primary database persistence:
  - Redis persistence (`RedisExecutionDAO`, `RedisMetadataDAO`, `RedisQueueDAO`, `RedisPollDataDAO`, `RedisRateLimitingDAO`, `RedisConcurrentExecutionLimitDAO`)
  - MySQL persistence (`MySQLExecutionDAO`, `MySQLMetadataDAO`, `MySQLQueueDAO`, `MySQLPollDataDAO`, `MySQLRateLimitingDAO`, `MySQLConcurrentExecutionLimitDAO`)
  - Cassandra persistence (`CassandraExecutionDAO`, `CassandraMetadataDAO`, `CassandraPollDataDAO`, `CassandraBaseDAO`)
  - Elasticsearch ES7/ES8 indexing implementations (`ElasticSearchRestDAOV7`, `ElasticSearchIndexDAO`)
- TypeScript implementation of core eventing, queuing, and messaging modules:
  - NATS JetStream queuing module backed by the `nats` client (`NatsQueue`)
  - Kafka queuing module backed by the `kafkajs` client (`KafkaQueue`)
  - Kafka Event Queue for publishing and subscribing to `EventExecution` structures
  - Workflow Event Listener and Publisher tracking started/completed/failed status transitions
  - Task Status Listener publishing task lifecycle state updates directly to QueueDAO
- Docker, Compose, and dev workspace scripts for running and testing AgentMesh services locally
- `AgentMeshTools` in `@agentmesh/agent-runtime` implementing tools for the Marketing, Scheduler, SelfHeal, and Research agents, verified with 100% unit test coverage
- Production helper templates: `ecosystem.config.cjs`, `agentmesh.service`, and `.env.production`

### Fixed

- Serialization bug in `TaskStatusListener` where `EventExecution` task status snapshots were discarded instead of pushed to the queue
- Prettier formatting check issues in `cloudbuild.yaml`

### Changed

- Fully rebranded Conductor workspace to AgentMesh, renaming all internal package packages from `@conductor` to `@agentmesh`
- Decoupled from Netflix namespace by refactoring all package imports and packages from `com.netflix` to `com.agentmesh` / `@agentmesh`
- Ported REST API and server-lite to NestJS, incorporating full OpenAPI/Swagger schema documentation and routing

### Removed

- Cleaned up all legacy Java and Groovy source folders, `build.gradle` build configurations, and Gradle wrapper files across all modules, resulting in a 100% pure TypeScript codebase
