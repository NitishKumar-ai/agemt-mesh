# OpenSearch 2.x Persistence

This module provides OpenSearch 2.x persistence for indexing workflows and tasks in AgentMesh.

## Overview

The `os-persistence-v2` module targets OpenSearch 2.x clusters (2.0 through 2.18+). It uses the
`opensearch-java 2.18.0` client with dependency shading to prevent classpath conflicts when the
server is deployed alongside the `os-persistence-v3` module.

## Configuration

Set the following properties to enable OpenSearch 2.x indexing:

```properties
agentmesh.indexing.enabled=true
agentmesh.indexing.type=opensearch2

# URL of the OpenSearch cluster (comma-separated for multiple nodes)
agentmesh.opensearch.url=http://localhost:9200

# Index prefix (default: agentmesh)
agentmesh.opensearch.indexPrefix=agentmesh
```

### All Configuration Properties

| Property | Default | Description |
|---|---|---|
| `agentmesh.opensearch.url` | `localhost:9201` | Comma-separated list of OpenSearch node URLs. Supports `http://` and `https://` schemes. |
| `agentmesh.opensearch.indexPrefix` | `agentmesh` | Prefix used when creating indices. |
| `agentmesh.opensearch.clusterHealthColor` | `green` | Cluster health color to wait for before starting (`green`, `yellow`). |
| `agentmesh.opensearch.indexBatchSize` | `1` | Number of documents per batch when async indexing is enabled. |
| `agentmesh.opensearch.asyncWorkerQueueSize` | `100` | Size of the async indexing task queue. |
| `agentmesh.opensearch.asyncMaxPoolSize` | `12` | Maximum threads in the async indexing pool. |
| `agentmesh.opensearch.asyncBufferFlushTimeout` | `10s` | How long async buffers are held before being flushed. |
| `agentmesh.opensearch.indexShardCount` | `5` | Number of shards per index. |
| `agentmesh.opensearch.indexReplicasCount` | `0` | Number of replicas per index. |
| `agentmesh.opensearch.taskLogResultLimit` | `10` | Maximum task log entries returned per query. |
| `agentmesh.opensearch.restClientConnectionRequestTimeout` | `-1` | Connection request timeout in ms (`-1` = unlimited). |
| `agentmesh.opensearch.autoIndexManagementEnabled` | `true` | Whether AgentMesh creates and manages indices automatically. |
| `agentmesh.opensearch.username` | _(none)_ | Username for basic authentication. |
| `agentmesh.opensearch.password` | _(none)_ | Password for basic authentication. |

### Basic Authentication

To connect to a secured OpenSearch cluster:

```properties
agentmesh.opensearch.username=myuser
agentmesh.opensearch.password=mypassword
```

### Single-Node / Development Clusters

A single-node cluster cannot achieve `green` health because replica shards have nowhere to be
assigned. Set:

```properties
agentmesh.opensearch.clusterHealthColor=yellow
agentmesh.opensearch.indexReplicasCount=0
```

### External Index Management

If you manage OpenSearch indices externally (e.g., via ILM policies or Terraform):

```properties
agentmesh.opensearch.autoIndexManagementEnabled=false
```

## Migration from Legacy `opensearch` Type

If you previously used `agentmesh.indexing.type=opensearch`, update to `opensearch2`:

```properties
# Before
agentmesh.indexing.type=opensearch
agentmesh.elasticsearch.url=http://localhost:9200

# After
agentmesh.indexing.type=opensearch2
agentmesh.opensearch.url=http://localhost:9200
```

The `agentmesh.elasticsearch.*` namespace is still accepted for backward compatibility but is
deprecated. A warning is logged at startup when legacy properties are detected.

## Docker Compose

```shell
docker compose -f docker/docker-compose-redis-os2.yaml up
```

This starts AgentMesh, Redis, and OpenSearch 2.18.0.

## Dependency Isolation

OpenSearch 2.x and 3.x use identical Java package names (`org.opensearch.client.*`). This module
uses the [Shadow plugin](https://github.com/johnrengelman/shadow) to relocate all OpenSearch client
classes to an isolated namespace:

```
org.opensearch.client → org.agentmeshoss.agentmesh.os2.shaded.opensearch.client
```

This allows both `os-persistence-v2` and `os-persistence-v3` to coexist on the same classpath
without conflicts.

## See Also

- [os-persistence-v3](../os-persistence-v3/README.md) — for OpenSearch 3.x clusters
- [OpenSearch configuration guide](../docs/documentation/advanced/opensearch.md)
- [Issue #678](https://github.com/agentmesh-oss/agentmesh/issues/678) — OpenSearch improvement epic
