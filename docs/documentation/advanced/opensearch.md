---
description: "OpenSearch Integration — configure OpenSearch as the indexing backend for searching AgentMesh workflows and tasks."
---
# OpenSearch

AgentMesh supports OpenSearch as an indexing backend for searching workflows and tasks via the UI.
Version-specific modules are provided for OpenSearch 2.x and 3.x.

## Quick Start

Choose the module that matches your OpenSearch cluster version and set `agentmesh.indexing.type`:

```properties
# For OpenSearch 2.x
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch2
agentmesh.opensearch.url=http://localhost:9200

# For OpenSearch 3.x
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch3
agentmesh.opensearch.url=http://localhost:9200
```

AgentMesh will create its indices on first startup and begin indexing workflows and tasks.

## Supported Versions

| Module | `agentmesh.indexing.type` | OpenSearch Version | Client Library |
|---|---|---|---|
| `os-persistence-v2` | `opensearch2` | 2.x (2.0 – 2.18+) | opensearch-java 2.18.0 |
| `os-persistence-v3` | `opensearch3` | 3.x (3.0+) | opensearch-java 3.0.0 |

OpenSearch 1.x is no longer supported. If you need 1.x support, see the
[archived os-persistence-v1 module](https://github.com/agentmesh-oss/agentmesh-os-persistence-v1).

## Configuration Reference

All OpenSearch configuration uses the `agentmesh.opensearch.*` namespace. Both the v2 and v3
modules share the same property names — only `agentmesh.indexing.type` differs.

### Connection

| Property | Default | Description |
|---|---|---|
| `agentmesh.opensearch.url` | `localhost:9201` | Comma-separated OpenSearch node URLs. HTTP and HTTPS are both supported. |
| `agentmesh.opensearch.username` | _(none)_ | Username for basic authentication. |
| `agentmesh.opensearch.password` | _(none)_ | Password for basic authentication. |

Multi-node example:

```properties
agentmesh.opensearch.url=http://os-node1:9200,http://os-node2:9200,http://os-node3:9200
```

### Index Management

| Property | Default | Description |
|---|---|---|
| `agentmesh.opensearch.indexPrefix` | `agentmesh` | Prefix for all AgentMesh-managed indices. |
| `agentmesh.opensearch.indexShardCount` | `5` | Primary shards per index. |
| `agentmesh.opensearch.indexReplicasCount` | `0` | Replica shards per index. |
| `agentmesh.opensearch.autoIndexManagementEnabled` | `true` | Whether AgentMesh creates and manages indices automatically. Set to `false` to manage indices externally. |
| `agentmesh.opensearch.clusterHealthColor` | `green` | Cluster health color AgentMesh waits for before starting. Use `yellow` for single-node clusters. |

### Performance Tuning

| Property | Default | Description |
|---|---|---|
| `agentmesh.opensearch.indexBatchSize` | `1` | Documents per batch in async mode. |
| `agentmesh.opensearch.asyncWorkerQueueSize` | `100` | Async indexing task queue depth. |
| `agentmesh.opensearch.asyncMaxPoolSize` | `12` | Maximum async indexing threads. |
| `agentmesh.opensearch.asyncBufferFlushTimeout` | `10s` | Maximum time an async buffer is held before flushing. |
| `agentmesh.opensearch.taskLogResultLimit` | `10` | Maximum task log entries returned per search. |
| `agentmesh.opensearch.restClientConnectionRequestTimeout` | `-1` | REST client connection request timeout in ms. `-1` means unlimited. |

## Example Configurations

### Development (single-node, no auth)

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch2
agentmesh.opensearch.url=http://localhost:9200
agentmesh.opensearch.indexPrefix=agentmesh
agentmesh.opensearch.indexReplicasCount=0
agentmesh.opensearch.clusterHealthColor=yellow
```

### Production (multi-node, auth, OpenSearch 2.x)

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch2
agentmesh.opensearch.url=https://os-node1:9200,https://os-node2:9200,https://os-node3:9200
agentmesh.opensearch.username=agentmesh_user
agentmesh.opensearch.password=secure_password
agentmesh.opensearch.indexPrefix=agentmesh
agentmesh.opensearch.indexShardCount=5
agentmesh.opensearch.indexReplicasCount=1
agentmesh.opensearch.clusterHealthColor=green
agentmesh.opensearch.asyncWorkerQueueSize=500
agentmesh.opensearch.asyncMaxPoolSize=24
agentmesh.opensearch.indexBatchSize=10
```

### OpenSearch 3.x

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch3
agentmesh.opensearch.url=http://localhost:9200
agentmesh.opensearch.indexPrefix=agentmesh
agentmesh.opensearch.indexReplicasCount=0
agentmesh.opensearch.clusterHealthColor=yellow
```

## Running with Docker Compose

Pre-built Docker Compose configurations are provided for both versions:

```shell
# OpenSearch 2.x
docker compose -f docker/docker-compose-redis-os2.yaml up

# OpenSearch 3.x
docker compose -f docker/docker-compose-redis-os3.yaml up
```

Both start AgentMesh, Redis, and the appropriate OpenSearch version.

## Migrating from the Legacy `opensearch` Type

The generic `agentmesh.indexing.type=opensearch` is deprecated. Starting the server with this
value will display an error message directing you to the new configuration.

**Before:**

```properties
agentmesh.indexing.type=opensearch
agentmesh.elasticsearch.url=http://localhost:9200
agentmesh.elasticsearch.indexName=agentmesh
```

**After:**

```properties
agentmesh.indexing.type=opensearch2   # or opensearch3
agentmesh.opensearch.url=http://localhost:9200
agentmesh.opensearch.indexPrefix=agentmesh
```

The `agentmesh.elasticsearch.*` namespace is still accepted for backward compatibility. When
detected, those values are used and a deprecation warning is logged at startup. Migrate to
`agentmesh.opensearch.*` before the next major release.

### Legacy property mapping

| Legacy (`agentmesh.elasticsearch.*`) | New (`agentmesh.opensearch.*`) |
|---|---|
| `url` | `url` |
| `indexName` | `indexPrefix` |
| `clusterHealthColor` | `clusterHealthColor` |
| `indexBatchSize` | `indexBatchSize` |
| `asyncWorkerQueueSize` | `asyncWorkerQueueSize` |
| `asyncMaxPoolSize` | `asyncMaxPoolSize` |
| `indexShardCount` | `indexShardCount` |
| `indexReplicasCount` | `indexReplicasCount` |
| `taskLogResultLimit` | `taskLogResultLimit` |
| `username` | `username` |
| `password` | `password` |

## Disabling Indexing

To run AgentMesh without search indexing (disables workflow search in the UI):

```properties
agentmesh.indexing.enabled=false
```

## Troubleshooting

### AgentMesh fails to start: cluster health timeout

For single-node development clusters, set:

```properties
agentmesh.opensearch.clusterHealthColor=yellow
```

A single-node cluster cannot achieve `green` health because replica shards cannot be assigned.

### AgentMesh fails to start: `NoClassDefFoundError: org.opensearch.Version`

This error occurred with older `os-persistence` module versions and is resolved in the current
versioned modules. Ensure `agentmesh.indexing.type` is set to `opensearch2` or `opensearch3`.

### Configuration changes not taking effect in Docker

Config files are baked into the Docker image at build time. After changing `config-*.properties`:

```shell
docker compose -f docker/docker-compose-redis-os2.yaml build
docker compose -f docker/docker-compose-redis-os2.yaml up
```

Alternatively, mount the config file as a Docker volume to pick up changes without rebuilding.

## See Also

- [os-persistence-v2 README](https://github.com/agentmesh-oss/agentmesh/blob/main/os-persistence-v2/README.md)
- [os-persistence-v3 README](https://github.com/agentmesh-oss/agentmesh/blob/main/os-persistence-v3/README.md)
- [Issue #678](https://github.com/agentmesh-oss/agentmesh/issues/678) — OpenSearch improvement epic
- [OpenSearch documentation](https://opensearch.org/docs/latest/)
