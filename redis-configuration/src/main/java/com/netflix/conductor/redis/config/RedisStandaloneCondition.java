package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Condition that matches when Redis Standalone is needed for EITHER persistence (db.type) OR
 * queuing (queue.type). Use this for Redis Standalone connection infrastructure (connection pool,
 * JedisCommands) that must be available whenever Redis Standalone is in use, regardless of purpose.
 */
public class RedisStandaloneCondition extends AnyNestedCondition {

    public RedisStandaloneCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_standalone")
    static class DbRedisStandalone {}

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_standalone")
    static class QueueRedisStandalone {}
}
