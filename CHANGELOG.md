# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Changed
- Fully rebranded Conductor workspace to AgentMesh, renaming all internal package packages from `@conductor` to `@agentmesh`
- Decoupled from Netflix namespace by refactoring all package imports and packages from `com.netflix` to `com.agentmesh` / `@agentmesh`
- Ported REST API and server-lite to NestJS, incorporating full OpenAPI/Swagger schema documentation and routing

### Removed
- Cleaned up all legacy Java and Groovy source folders, `build.gradle` build configurations, and Gradle wrapper files across all modules, resulting in a 100% pure TypeScript codebase
