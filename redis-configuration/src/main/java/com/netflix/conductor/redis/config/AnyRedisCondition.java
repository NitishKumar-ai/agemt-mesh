package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public class AnyRedisCondition extends AnyNestedCondition {

    public AnyRedisCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "memory")
    static class InMemoryRedisCondition {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_cluster")
    static class RedisClusterConfiguration {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_sentinel")
    static class RedisSentinelConfiguration {}

    @ConditionalOnProperty(name = "conductor.db.type", havingValue = "redis_standalone")
    static class RedisStandaloneConfiguration {}
}
