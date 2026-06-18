# OpenSearch 3.x Persistence

This module provides OpenSearch 3.x persistence for indexing workflows and tasks in AgentMesh.

## Overview

The `os-persistence-v3` module targets OpenSearch 3.x clusters. It uses the `opensearch-java 3.0.0`
client — a complete rewrite from the 2.x High-Level REST client to a new Jakarta JSON-based API.
Dependency shading prevents classpath conflicts when deployed alongside `os-persistence-v2`.

## Configuration

Set the following properties to enable OpenSearch 3.x indexing:

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch3

# URL of the OpenSearch cluster (comma-separated for multiple nodes)
agentmesh.opensearch.url=http://localhost:9200

# Index prefix (default: agentmesh)
agentmesh.opensearch.indexPrefix=agentmesh
```

### All Configuration Properties

| Property                                                  | Default          | Description                                                                              |
| --------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `agentmesh.opensearch.url`                                | `localhost:9201` | Comma-separated list of OpenSearch node URLs. Supports `http://` and `https://` schemes. |
| `agentmesh.opensearch.indexPrefix`                        | `agentmesh`      | Prefix used when creating indices.                                                       |
| `agentmesh.opensearch.clusterHealthColor`                 | `green`          | Cluster health color to wait for before starting (`green`, `yellow`).                    |
| `agentmesh.opensearch.indexBatchSize`                     | `1`              | Number of documents per batch when async indexing is enabled.                            |
| `agentmesh.opensearch.asyncWorkerQueueSize`               | `100`            | Size of the async indexing task queue.                                                   |
| `agentmesh.opensearch.asyncMaxPoolSize`                   | `12`             | Maximum threads in the async indexing pool.                                              |
| `agentmesh.opensearch.asyncBufferFlushTimeout`            | `10s`            | How long async buffers are held before being flushed.                                    |
| `agentmesh.opensearch.indexShardCount`                    | `5`              | Number of shards per index.                                                              |
| `agentmesh.opensearch.indexReplicasCount`                 | `0`              | Number of replicas per index.                                                            |
| `agentmesh.opensearch.taskLogResultLimit`                 | `10`             | Maximum task log entries returned per query.                                             |
| `agentmesh.opensearch.restClientConnectionRequestTimeout` | `-1`             | Connection request timeout in ms (`-1` = unlimited).                                     |
| `agentmesh.opensearch.autoIndexManagementEnabled`         | `true`           | Whether AgentMesh creates and manages indices automatically.                             |
| `agentmesh.opensearch.username`                           | _(none)_         | Username for basic authentication.                                                       |
| `agentmesh.opensearch.password`                           | _(none)_         | Password for basic authentication.                                                       |

Properties are identical to `os-persistence-v2` — both modules share the `agentmesh.opensearch.*`
namespace. Only `agentmesh.indexing.type` differs (`opensearch2` vs `opensearch3`).

### Single-Node / Development Clusters

```properties
agentmesh.opensearch.clusterHealthColor=yellow
agentmesh.opensearch.indexReplicasCount=0
```

## Migration from Legacy `opensearch` Type

```properties
# Before
agentmesh.indexing.type=opensearch
agentmesh.elasticsearch.url=http://localhost:9200

# After
agentmesh.indexing.type=opensearch3
agentmesh.opensearch.url=http://localhost:9200
```

## Docker Compose

```shell
docker compose -f docker/docker-compose-redis-os3.yaml up
```

This starts AgentMesh, Redis, and OpenSearch 3.0.0.

## Dependency Isolation

OpenSearch 2.x and 3.x use identical Java package names (`org.opensearch.client.*`). This module
uses the [Shadow plugin](https://github.com/johnrengelman/shadow) to relocate all OpenSearch client
classes to an isolated namespace:

```
org.opensearch.client → org.agentmeshoss.agentmesh.os3.shaded.opensearch.client
```

This allows both `os-persistence-v2` and `os-persistence-v3` to coexist on the same classpath
without conflicts.

## API Changes from 2.x to 3.x

The v3 module required significant changes from the v2 implementation:

- **Client**: `RestHighLevelClient` → `OpenSearchClient` with `RestClientTransport`
- **Query building**: `QueryBuilders.*` → functional lambda builders
- **Search results**: `SearchHits` → typed `hits().hits()` with generics
- **Index ops**: `XContentType.JSON` string source → typed document objects
- **HTTP client**: Apache HttpClient 4.x → Apache HttpClient 5.x

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for a detailed API comparison.

## See Also

- [os-persistence-v2](../os-persistence-v2/README.md) — for OpenSearch 2.x clusters
- [OpenSearch configuration guide](../docs/documentation/advanced/opensearch.md)
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) — detailed 2.x → 3.x API reference
- [Issue #678](https://github.com/agentmesh-oss/agentmesh/issues/678) — OpenSearch improvement epic
