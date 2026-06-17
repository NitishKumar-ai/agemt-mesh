package com.netflix.conductor.redislock.config;

import org.redisson.api.RedissonClient;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.redisson.api.redisnode.RedisNodes.*;

@Component
@ConditionalOnProperty(name = "management.health.redis.enabled", havingValue = "true")
public class RedisHealthIndicator implements HealthIndicator {
    private final RedissonClient redisClient;
    private final RedisLockProperties redisProperties;

    public RedisHealthIndicator(RedissonClient redisClient, RedisLockProperties redisProperties) {
        this.redisClient = redisClient;
        this.redisProperties = redisProperties;
    }

    @Override
    public Health health() {
        return isHealth() ? Health.up().build() : Health.down().build();
    }

    private boolean isHealth() {
        switch (redisProperties.getServerType()) {
            case SINGLE -> {
                return redisClient.getRedisNodes(SINGLE).pingAll(5, SECONDS);
            }

            case CLUSTER -> {
                return redisClient.getRedisNodes(CLUSTER).pingAll(5, SECONDS);
            }

            case SENTINEL -> {
                return redisClient.getRedisNodes(SENTINEL_MASTER_SLAVE).pingAll(5, SECONDS);
            }

            default -> {
                return false;
            }
        }
    }
}
