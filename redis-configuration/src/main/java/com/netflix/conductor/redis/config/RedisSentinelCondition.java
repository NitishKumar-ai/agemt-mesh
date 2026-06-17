package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Condition that matches when Redis Sentinel is needed for EITHER persistence (db.type) OR queuing
 * (queue.type). Use this for Redis Sentinel connection infrastructure (connection pool,
 * JedisCommands) that must be available whenever Redis Sentinel is in use, regardless of purpose.
 */
public class RedisSentinelCondition extends AnyNestedCondition {

    public RedisSentinelCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_sentinel")
    static class DbRedisSentinel {}

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_sentinel")
    static class QueueRedisSentinel {}
}
