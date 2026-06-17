package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Condition that matches when Redis Cluster is needed for EITHER persistence (db.type) OR queuing
 * (queue.type). Use this for Redis Cluster connection infrastructure (connection pool,
 * JedisCommands) that must be available whenever Redis Cluster is in use, regardless of purpose.
 */
public class RedisClusterCondition extends AnyNestedCondition {

    public RedisClusterCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_cluster")
    static class DbRedisCluster {}

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_cluster")
    static class QueueRedisCluster {}
}
