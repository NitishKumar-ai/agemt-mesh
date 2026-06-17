package com.netflix.conductor.redis.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

import static org.junit.jupiter.api.Assertions.*;

class RedisConnectionConditionTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            StandaloneMarkerConfiguration.class,
                            ClusterMarkerConfiguration.class,
                            SentinelMarkerConfiguration.class);

    @Test
    void standaloneConditionMatchesWhenQueueUsesRedisStandalone() {
        contextRunner
                .withPropertyValues("conductor.queue.type=redis_standalone")
                .run(context -> assertTrue(context.containsBean("standaloneMarker")));
    }

    @Test
    void clusterConditionMatchesWhenQueueUsesRedisCluster() {
        contextRunner
                .withPropertyValues("conductor.queue.type=redis_cluster")
                .run(context -> assertTrue(context.containsBean("clusterMarker")));
    }

    @Test
    void sentinelConditionMatchesWhenQueueUsesRedisSentinel() {
        contextRunner
                .withPropertyValues("conductor.queue.type=redis_sentinel")
                .run(context -> assertTrue(context.containsBean("sentinelMarker")));
    }

    @Configuration(proxyBeanMethods = false)
    @Conditional(RedisStandaloneCondition.class)
    static class StandaloneMarkerConfiguration {

        @Bean
        String standaloneMarker() {
            return "standalone";
        }
    }

    @Configuration(proxyBeanMethods = false)
    @Conditional(RedisClusterCondition.class)
    static class ClusterMarkerConfiguration {

        @Bean
        String clusterMarker() {
            return "cluster";
        }
    }

    @Configuration(proxyBeanMethods = false)
    @Conditional(RedisSentinelCondition.class)
    static class SentinelMarkerConfiguration {

        @Bean
        String sentinelMarker() {
            return "sentinel";
        }
    }
}
