---
description: 'Deploy AgentMesh as a self-hosted workflow engine in production — architecture overview, horizontal scaling, database, queue, indexing, and lock configuration, workflow monitoring, and recommended production deployment settings for this open source workflow orchestration platform.'
---

# Self-hosted deployment guide

AgentMesh is a self-hosted, open source workflow engine that you deploy on your own infrastructure. This production deployment guide covers everything you need to run AgentMesh at scale: architecture, backend configuration, horizontal scaling, workflow monitoring, and tuning.

## Architecture overview

A AgentMesh deployment consists of these components:

![AgentMesh Architecture](../architecture/agentmesh-architecture.png)

**What each component does:**

| Component               | Role                                                                                                                                            |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Server**          | Exposes REST and gRPC endpoints for workflow and task operations.                                                                               |
| **Decider**             | The core state machine. Evaluates workflow state and schedules the next set of tasks.                                                           |
| **Sweeper**             | Background process that polls for running workflows and triggers the decider to evaluate them. Required for progress on long-running workflows. |
| **System Task Workers** | Execute built-in task types (HTTP, Event, Wait, Inline, JSON_JQ, etc.) within the server JVM.                                                   |
| **Event Processor**     | Listens to configured event buses and triggers workflows or completes tasks based on incoming events.                                           |
| **Database**            | Persists workflow definitions, execution state, task state, and poll data.                                                                      |
| **Queue**               | Manages task scheduling — pending tasks, delayed tasks, and the sweeper's own work queue.                                                       |
| **Index**               | Powers workflow and task search in the UI and via the search API.                                                                               |
| **Lock**                | Distributed lock that prevents concurrent decider evaluations of the same workflow. **Required in production.**                                 |

---

## Quick start with Docker Compose

For local development and evaluation:

```shell
git clone https://github.com/agentmesh-oss/agentmesh
cd agentmesh
docker compose -f docker/docker-compose.yaml up
```

This starts AgentMesh with Redis (database + queue), Elasticsearch (indexing), and the server with UI on port **8080**.

| URL                                           | Description   |
| :-------------------------------------------- | :------------ |
| `http://localhost:8080`                       | AgentMesh UI  |
| `http://localhost:8080/swagger-ui/index.html` | REST API docs |
| `http://localhost:8080/api/`                  | API base URL  |

Pre-built compose files for other backend combinations:

| Compose file                       | Database   | Queue      | Index           |
| :--------------------------------- | :--------- | :--------- | :-------------- |
| `docker-compose.yaml`              | Redis      | Redis      | Elasticsearch 7 |
| `docker-compose-es8.yaml`          | Redis      | Redis      | Elasticsearch 8 |
| `docker-compose-postgres.yaml`     | PostgreSQL | PostgreSQL | PostgreSQL      |
| `docker-compose-postgres-es7.yaml` | PostgreSQL | PostgreSQL | Elasticsearch 7 |
| `docker-compose-mysql.yaml`        | MySQL      | Redis      | Elasticsearch 7 |
| `docker-compose-redis-os2.yaml`    | Redis      | Redis      | OpenSearch 2    |
| `docker-compose-redis-os3.yaml`    | Redis      | Redis      | OpenSearch 3    |

```shell
# Example: PostgreSQL for everything
docker compose -f docker/docker-compose-postgres.yaml up

# Example: Redis + Elasticsearch 8
docker compose -f docker/docker-compose-es8.yaml up

# Example: Redis + OpenSearch 3
docker compose -f docker/docker-compose-redis-os3.yaml up
```

For Elasticsearch 8, set `agentmesh.indexing.type=elasticsearch8` and use
`config-redis-es8.properties` or an equivalent custom config.

---

## Production configuration

All configuration is done via Spring Boot properties in `application.properties` or environment variables. Properties can also be mounted as a Docker volume.

### Database

The database stores workflow definitions, execution state, task state, and event handler definitions.

```properties
agentmesh.db.type=postgres
```

**Supported database backends:**

| Backend    | Property value     | When to use                                                                 | Notes                                                                        |
| :--------- | :----------------- | :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| PostgreSQL | `postgres`         | **Recommended for production.** ACID, battle-tested, supports indexing too. | Requires `spring.datasource.*` config.                                       |
| MySQL      | `mysql`            | Production alternative if your team already runs MySQL.                     | Requires `spring.datasource.*` config. Needs separate queue backend (Redis). |
| Redis      | `redis_standalone` | Fast, simple. Good for moderate scale.                                      | Requires `agentmesh.redis.*` config.                                         |
| Cassandra  | `cassandra`        | High write throughput, multi-region.                                        | Requires `agentmesh.cassandra.*` config.                                     |
| SQLite     | `sqlite`           | **Local development only.** Single-file, zero config.                       | Default. Not for production.                                                 |

#### PostgreSQL

```properties
agentmesh.db.type=postgres
agentmesh.external-payload-storage.type=postgres

spring.datasource.url=jdbc:postgresql://db-host:5432/agentmesh
spring.datasource.username=agentmesh
spring.datasource.password=<password>

# Optional tuning
agentmesh.postgres.deadlockRetryMax=3
agentmesh.postgres.taskDefCacheRefreshInterval=60s
agentmesh.postgres.asyncMaxPoolSize=12
agentmesh.postgres.asyncWorkerQueueSize=100
```

#### MySQL

```properties
agentmesh.db.type=mysql

spring.datasource.url=jdbc:mysql://db-host:3306/agentmesh
spring.datasource.username=agentmesh
spring.datasource.password=<password>

# Optional tuning
agentmesh.mysql.deadlockRetryMax=3
agentmesh.mysql.taskDefCacheRefreshInterval=60s
```

#### Redis

```properties
agentmesh.db.type=redis_standalone

# Format: host:port:rack (semicolon-separated for multiple hosts)
agentmesh.redis.hosts=redis-host:6379:us-east-1c
agentmesh.redis.workflowNamespacePrefix=agentmesh
agentmesh.redis.queueNamespacePrefix=agentmesh_queues
agentmesh.redis.taskDefCacheRefreshInterval=1s

# Connection pool
agentmesh.redis.maxIdleConnections=8
agentmesh.redis.minIdleConnections=5

# SSL
agentmesh.redis.ssl=false

# Auth (password is taken from the first host entry: host:port:rack:password)
# Or set agentmesh.redis.username and agentmesh.redis.password directly
```

---

### Queue

The queue backend manages task scheduling — it tracks which tasks are pending, delayed, or ready for execution. The sweeper and system task workers all depend on it.

```properties
agentmesh.queue.type=postgres
```

**Supported queue backends:**

| Backend    | Property value     | When to use                                             |
| :--------- | :----------------- | :------------------------------------------------------ |
| PostgreSQL | `postgres`         | Use when database is also PostgreSQL. Simplest stack.   |
| Redis      | `redis_standalone` | Use when database is Redis or MySQL. Fast, low-latency. |
| SQLite     | `sqlite`           | Local development only.                                 |

!!! tip "Match your queue backend to your database"
PostgreSQL database + PostgreSQL queue is the simplest production stack — one fewer dependency. If you use MySQL for the database, pair it with Redis for the queue.

---

### Indexing

The indexing backend powers workflow and task search in the UI and via the `/api/workflow/search` and `/api/tasks/search` endpoints.

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=postgres
```

**Supported indexing backends:**

| Backend         | Property value   | When to use                                                   | Notes                                                         |
| :-------------- | :--------------- | :------------------------------------------------------------ | :------------------------------------------------------------ |
| PostgreSQL      | `postgres`       | Simplest stack when database is also PostgreSQL.              | Set `agentmesh.elasticsearch.version=0` to disable ES client. |
| Elasticsearch 7 | `elasticsearch`  | Best search performance at scale. Full-text search.           | Set `agentmesh.elasticsearch.version=7`.                      |
| Elasticsearch 8 | `elasticsearch8` | Use when running the ES8 persistence module.                  | Set `agentmesh.elasticsearch.version=8`.                      |
| OpenSearch 2    | `opensearch2`    | Open-source ES alternative.                                   | Compatible with ES 7 queries.                                 |
| OpenSearch 3    | `opensearch3`    | Latest OpenSearch.                                            |                                                               |
| SQLite          | `sqlite`         | Local development only.                                       |                                                               |
| Disabled        | N/A              | Set `agentmesh.indexing.enabled=false`. UI search won't work. |                                                               |

#### PostgreSQL indexing

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=postgres
# Disable Elasticsearch client
agentmesh.elasticsearch.version=0
```

#### Elasticsearch 7

```properties
agentmesh.indexing.enabled=true
agentmesh.elasticsearch.url=http://es-host:9200
agentmesh.elasticsearch.version=7
agentmesh.elasticsearch.indexName=agentmesh
agentmesh.elasticsearch.clusterHealthColor=yellow

# Performance tuning
agentmesh.elasticsearch.indexBatchSize=1
agentmesh.elasticsearch.asyncMaxPoolSize=12
agentmesh.elasticsearch.asyncWorkerQueueSize=100
agentmesh.elasticsearch.asyncBufferFlushTimeout=10s
agentmesh.elasticsearch.indexShardCount=5
agentmesh.elasticsearch.indexReplicasCount=1

# Auth (if using security)
agentmesh.elasticsearch.username=elastic
agentmesh.elasticsearch.password=<password>
```

#### Elasticsearch 8

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=elasticsearch8
agentmesh.elasticsearch.url=http://es-host:9200
agentmesh.elasticsearch.version=8
agentmesh.elasticsearch.indexName=agentmesh
agentmesh.elasticsearch.clusterHealthColor=yellow
```

#### OpenSearch

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch2   # or opensearch3
agentmesh.opensearch.url=http://os-host:9200
agentmesh.opensearch.indexPrefix=agentmesh
agentmesh.opensearch.clusterHealthColor=yellow
agentmesh.opensearch.indexReplicasCount=0
```

#### Async indexing

For high-throughput deployments, enable async indexing to decouple the indexing path from the workflow execution path:

```properties
agentmesh.app.asyncIndexingEnabled=true
agentmesh.app.asyncUpdateShortRunningWorkflowDuration=30s
agentmesh.app.asyncUpdateDelay=60s
```

#### Indexing toggles

Control what gets indexed:

```properties
agentmesh.app.taskIndexingEnabled=true
agentmesh.app.taskExecLogIndexingEnabled=true
agentmesh.app.eventMessageIndexingEnabled=true
agentmesh.app.eventExecutionIndexingEnabled=true
```

---

### Locking

!!! warning "Required for production"
Distributed locking prevents race conditions when multiple server instances evaluate the same workflow concurrently. **Always enable locking in production with a distributed lock provider** (Redis or Zookeeper).

```properties
agentmesh.workflow-execution-lock.type=redis
agentmesh.app.workflowExecutionLockEnabled=true
```

**Supported lock providers:**

| Provider  | Property value | When to use                                                        |
| :-------- | :------------- | :----------------------------------------------------------------- |
| Redis     | `redis`        | **Recommended.** Use when Redis is already in the stack.           |
| Zookeeper | `zookeeper`    | Use when Zookeeper is available (e.g. Kafka deployments).          |
| Local     | `local_only`   | Single-instance development only. **Not safe for multi-instance.** |

#### Redis lock

```properties
agentmesh.workflow-execution-lock.type=redis
agentmesh.app.workflowExecutionLockEnabled=true
agentmesh.app.lockLeaseTime=60000      # lock held for max 60s
agentmesh.app.lockTimeToTry=500        # wait up to 500ms to acquire

agentmesh.redis-lock.serverType=SINGLE              # SINGLE, CLUSTER, or SENTINEL
agentmesh.redis-lock.serverAddress=redis://redis-host:6379
# agentmesh.redis-lock.serverPassword=<password>
# agentmesh.redis-lock.serverMasterName=master     # for Sentinel
# agentmesh.redis-lock.namespace=agentmesh          # key prefix
agentmesh.redis-lock.ignoreLockingExceptions=false
```

> **Sentinel with multiple endpoints:** When using `SENTINEL` server type, you can provide
> multiple sentinel addresses separated by semicolons for improved high availability:
>
> ```properties
> agentmesh.redis-lock.serverType=SENTINEL
> agentmesh.redis-lock.serverAddress=redis://sentinel-0:26379;redis://sentinel-1:26379
> agentmesh.redis-lock.serverMasterName=mymaster
> ```
>
> This ensures the lock client can discover the master even if one sentinel node is down.

#### Zookeeper lock

```properties
agentmesh.workflow-execution-lock.type=zookeeper
agentmesh.app.workflowExecutionLockEnabled=true
agentmesh.app.lockLeaseTime=60000
agentmesh.app.lockTimeToTry=500

agentmesh.zookeeper-lock.connectionString=zk1:2181,zk2:2181,zk3:2181
# agentmesh.zookeeper-lock.sessionTimeoutMs=60000
# agentmesh.zookeeper-lock.connectionTimeoutMs=15000
# agentmesh.zookeeper-lock.namespace=agentmesh
```

---

### Sweeper

The sweeper is a background process that monitors running workflows. It polls the queue for workflows that need evaluation and triggers the decider. Without the sweeper, long-running workflows will not make progress.

The sweeper runs automatically as part of the AgentMesh server. Tune the thread count based on your workflow volume:

```properties
# Number of sweeper threads (default: availableProcessors * 2)
agentmesh.app.sweeperThreadCount=8

# How long to wait when polling the sweep queue (default: 2000ms)
agentmesh.app.sweeperWorkflowPollTimeout=2000

# Batch size per sweep poll (default: 2)
agentmesh.app.sweeper.sweepBatchSize=2

# Queue pop timeout in ms (default: 100)
agentmesh.app.sweeper.queuePopTimeout=100
```

!!! tip "Sweeper sizing"
Start with `sweeperThreadCount = 2 * CPU cores`. If you see workflows stuck in RUNNING state, increase it. If CPU usage is high on idle, decrease it.

---

### System task workers

System task workers execute built-in task types (HTTP, Event, Wait, Inline, JSON_JQ_TRANSFORM, etc.) inside the AgentMesh server JVM. They poll internal queues for scheduled system tasks and execute them.

```properties
# Number of system task worker threads (default: availableProcessors * 2)
agentmesh.app.systemTaskWorkerThreadCount=20

# Max number of tasks to poll at once (default: same as thread count)
agentmesh.app.systemTaskMaxPollCount=20

# Poll interval (default: 50ms)
agentmesh.app.systemTaskWorkerPollInterval=50ms

# Callback duration — how often to re-check async system tasks (default: 30s)
agentmesh.app.systemTaskWorkerCallbackDuration=30s

# Queue pop timeout (default: 100ms)
agentmesh.app.systemTaskQueuePopTimeout=100ms
```

#### Running system task workers separately

In large deployments, you may want to run system task workers on dedicated instances, separate from the API server. Use the **execution namespace** to isolate which instance handles system tasks:

```properties
# On API-only instances — set a namespace that no system task worker listens on
agentmesh.app.systemTaskWorkerExecutionNamespace=api-only
agentmesh.app.systemTaskWorkerThreadCount=0

# On dedicated system task worker instances — match the namespace
agentmesh.app.systemTaskWorkerExecutionNamespace=worker-pool-1
agentmesh.app.systemTaskWorkerThreadCount=40
agentmesh.app.systemTaskMaxPollCount=40
```

#### Isolated system task workers

For task domain isolation (routing specific tasks to specific worker groups):

```properties
# Threads per isolation group (default: 1)
agentmesh.app.isolatedSystemTaskWorkerThreadCount=4
```

#### Postpone threshold

When a system task has been polled many times without completing (e.g. a Join waiting for branches), AgentMesh progressively delays re-evaluation to avoid busy-polling:

```properties
# After this many polls, begin exponential backoff (default: 200)
agentmesh.app.systemTaskPostponeThreshold=200
```

---

### Event processing

The event processor listens to configured event buses and triggers workflows or completes tasks based on incoming events.

```properties
# Thread count for event processing (default: 2)
agentmesh.app.eventProcessorThreadCount=4

# Event queue polling
agentmesh.app.eventQueueSchedulerPollThreadCount=4  # default: CPU cores
agentmesh.app.eventQueuePollInterval=100ms
agentmesh.app.eventQueuePollCount=10
agentmesh.app.eventQueueLongPollTimeout=1000ms
```

See the [Event-driven recipes](../cookbook/event-driven.md) for configuring Kafka, NATS, AMQP, and SQS event queues.

---

### Payload size limits

AgentMesh enforces payload size limits to prevent oversized data from degrading performance. When a payload exceeds the threshold, it is automatically stored in external payload storage (S3, PostgreSQL, or Azure Blob).

```properties
# Workflow input/output — threshold to move to external storage (default: 5120 KB)
agentmesh.app.workflowInputPayloadSizeThreshold=5120KB
agentmesh.app.workflowOutputPayloadSizeThreshold=5120KB

# Workflow input/output — hard limit, fails the workflow (default: 10240 KB)
agentmesh.app.maxWorkflowInputPayloadSizeThreshold=10240KB
agentmesh.app.maxWorkflowOutputPayloadSizeThreshold=10240KB

# Task input/output — threshold to move to external storage (default: 3072 KB)
agentmesh.app.taskInputPayloadSizeThreshold=3072KB
agentmesh.app.taskOutputPayloadSizeThreshold=3072KB

# Task input/output — hard limit, fails the task (default: 10240 KB)
agentmesh.app.maxTaskInputPayloadSizeThreshold=10240KB
agentmesh.app.maxTaskOutputPayloadSizeThreshold=10240KB

# Workflow variables — hard limit (default: 256 KB)
agentmesh.app.maxWorkflowVariablesPayloadSizeThreshold=256KB
```

For external payload storage configuration, see [External Payload Storage](../../documentation/advanced/externalpayloadstorage.md).

---

### Workflow monitoring and observability

AgentMesh exposes Prometheus-compatible metrics out of the box for workflow monitoring and observability:

```properties
agentmesh.metrics-prometheus.enabled=true
management.endpoints.web.exposure.include=health,info,prometheus
management.metrics.web.server.request.autotime.percentiles=0.50,0.75,0.90,0.95,0.99
management.endpoint.health.show-details=always
```

Scrape `http://<agentmesh-host>:8080/actuator/prometheus` with Prometheus.

For details on available metrics, see [Server Metrics](../../documentation/metrics/server.md) and [Client Metrics](../../documentation/metrics/client.md).

---

## Recommended production configurations

### PostgreSQL stack (simplest)

One database for everything — fewest moving parts.

```properties
# Database
agentmesh.db.type=postgres
agentmesh.queue.type=postgres
agentmesh.external-payload-storage.type=postgres
spring.datasource.url=jdbc:postgresql://db-host:5432/agentmesh
spring.datasource.username=agentmesh
spring.datasource.password=<password>

# Indexing (use PostgreSQL, no Elasticsearch needed)
agentmesh.indexing.enabled=true
agentmesh.indexing.type=postgres
agentmesh.elasticsearch.version=0

# Locking (use Redis — lightweight, fast)
agentmesh.workflow-execution-lock.type=redis
agentmesh.app.workflowExecutionLockEnabled=true
agentmesh.redis-lock.serverAddress=redis://redis-host:6379

# Sweeper
agentmesh.app.sweeperThreadCount=8

# System task workers
agentmesh.app.systemTaskWorkerThreadCount=20
agentmesh.app.systemTaskMaxPollCount=20

# Metrics
agentmesh.metrics-prometheus.enabled=true
management.endpoints.web.exposure.include=health,info,prometheus
```

### Redis + Elasticsearch stack (high throughput)

Best search performance and lowest latency for queue operations.

```properties
# Database + Queue
agentmesh.db.type=redis_standalone
agentmesh.queue.type=redis_standalone
agentmesh.redis.hosts=redis-host:6379:us-east-1c
agentmesh.redis.workflowNamespacePrefix=agentmesh
agentmesh.redis.queueNamespacePrefix=agentmesh_queues

# Indexing
agentmesh.indexing.enabled=true
agentmesh.elasticsearch.url=http://es-host:9200
agentmesh.elasticsearch.version=7
agentmesh.elasticsearch.indexName=agentmesh
agentmesh.elasticsearch.clusterHealthColor=yellow
agentmesh.app.asyncIndexingEnabled=true

# Locking
agentmesh.workflow-execution-lock.type=redis
agentmesh.app.workflowExecutionLockEnabled=true
agentmesh.redis-lock.serverAddress=redis://redis-host:6379

# Sweeper
agentmesh.app.sweeperThreadCount=16

# System task workers
agentmesh.app.systemTaskWorkerThreadCount=40
agentmesh.app.systemTaskMaxPollCount=40

# Metrics
agentmesh.metrics-prometheus.enabled=true
management.endpoints.web.exposure.include=health,info,prometheus
```

---

## Running with Docker

### Using Docker Compose

```shell
git clone https://github.com/agentmesh-oss/agentmesh
cd agentmesh
docker compose -f docker/docker-compose.yaml up
```

To use a different backend, swap the compose file:

```shell
docker compose -f docker/docker-compose-postgres.yaml up
```

### Using the standalone image

```shell
docker run -p 8080:8080 agentmeshoss/agentmesh:latest
```

### Custom configuration via volume mount

Mount your own properties file to override the defaults without rebuilding the image:

```shell
docker run -p 8080:8080 \
  -v /path/to/my-config.properties:/app/config/config.properties \
  agentmeshoss/agentmesh:latest
```

### Accessing AgentMesh

| URL                                           | Description   |
| :-------------------------------------------- | :------------ |
| `http://localhost:8080`                       | AgentMesh UI  |
| `http://localhost:8080/swagger-ui/index.html` | REST API docs |

### Shutting down

```shell
# Ctrl+C to stop, then:
docker compose down
```

---

## Multi-instance deployment and horizontal scaling

For high availability and horizontal scaling, run multiple AgentMesh server instances behind a load balancer. All instances share the same database, queue, index, and lock backends. This architecture enables workflow engine scalability to millions of concurrent executions.

**Requirements:**

- **Distributed locking must be enabled** (`redis` or `zookeeper`). Without it, concurrent decider evaluations on the same workflow will cause race conditions.
- All instances must point to the same database, queue, and indexing backends.
- The load balancer should use round-robin or least-connections routing.

**Optional: separate API and worker instances:**

```
┌──────────────────┐     ┌──────────────────┐
│  API Instance 1  │     │  API Instance 2  │   ← handle REST/gRPC, low system task threads
│  (systemTask=0)  │     │  (systemTask=0)  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
    ┌────┴────────────────────────┴────┐
    │         Load Balancer            │
    └────┬────────────────────────┬────┘
         │                        │
┌────────┴──────────┐     ┌───────┴───────────┐
│  Worker Instance  │     │  Worker Instance  │  ← high system task threads, sweeper
│  (systemTask=40)  │     │  (systemTask=40)  │
└───────────────────┘     └───────────────────┘
```

---

## Troubleshooting

| Issue                                | Fix                                                                                                                    |
| :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Out of memory or slow performance    | Check JVM heap usage and adjust `-Xms` / `-Xmx` as necessary. Monitor with `jstat` or the `/actuator/health` endpoint. |
| Elasticsearch stuck in yellow health | Set `agentmesh.elasticsearch.clusterHealthColor=yellow` or add more ES nodes for green.                                |
| Workflows stuck in RUNNING           | Check sweeper is running and `sweeperThreadCount > 0`. Check lock provider is reachable.                               |
| System tasks not executing           | Verify `systemTaskWorkerThreadCount > 0` and the queue backend is reachable.                                           |
| Config changes not taking effect     | Properties are baked into the Docker image at build time. Mount a volume instead of rebuilding.                        |
