package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Condition that matches when a Redis connection is needed for ANY purpose — either as the primary
 * database (conductor.db.type) or as the queue backend (conductor.queue.type).
 *
 * <p>Use this for Redis infrastructure beans (connection pools, proxies, monitors) that must be
 * available whenever Redis is in use, regardless of whether it serves as DB or queue.
 *
 * <p>Contrast with {@link AnyRedisCondition} which only checks conductor.db.type and is used for
 * Redis persistence beans that should only load when Redis IS the primary database.
 */
public class AnyRedisConnectionCondition extends AnyNestedCondition {

    public AnyRedisConnectionCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    // --- conductor.db.type checks ---

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "memory")
    static class DbInMemory {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_cluster")
    static class DbRedisCluster {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_sentinel")
    static class DbRedisSentinel {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_standalone")
    static class DbRedisStandalone {}

    // --- conductor.queue.type checks ---

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_cluster")
    static class QueueRedisCluster {}

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_sentinel")
    static class QueueRedisSentinel {}

    @ConditionalOnProperty(name = "conductor.queue.type", havingValue = "redis_standalone")
    static class QueueRedisStandalone {}
}
