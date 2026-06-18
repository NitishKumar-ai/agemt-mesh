---
description: 'Redis Backend — configure Redis Standalone, Cluster, or Sentinel as the database and queue backend for AgentMesh.'
---

# Redis

Configure Redis as the database and queue backend by setting the properties below.

## `agentmesh.db.type` and `agentmesh.queue.type`

| Value            | Description                     |
| ---------------- | ------------------------------- |
| redis_standalone | Redis Standalone configuration. |
| redis_cluster    | Redis Cluster configuration.    |
| redis_sentinel   | Redis Sentinel configuration.   |

## `agentmesh.redis.hosts`

Expected format is `host:port:rack` separated by semicolon, e.g.:

```properties
agentmesh.redis.hosts=host0:6379:us-east-1c;host1:6379:us-east-1c;host2:6379:us-east-1c
```

## `agentmesh.redis.database`

Redis database value other than default of 0 is supported in sentinel and standalone configurations.
Redis cluster mode only uses database 0, and the configuration is ignored.

```properties
agentmesh.redis.database=1
```

## `agentmesh.redis.username`

[Redis ACL](https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/) using username and password authentication is now supported.

The username property should be set as `agentmesh.redis.username`, e.g.:

```properties
agentmesh.redis.username=agentmesh
```

If not set, the client uses `default` as the username.

The password should be set as the 4th param of the first host `host:port:rack:password`, e.g.:

```properties
agentmesh.redis.hosts=host0:6379:us-east-1c:my_str0ng_pazz;host1:6379:us-east-1c;host2:6379:us-east-1c
```

**Notes**

- In a cluster, all nodes use the same username and password.
- In a sentinel configuration, sentinels and redis nodes use the same database index, username, and password.
