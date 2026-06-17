package com.netflix.conductor.redislock.config;

import java.util.concurrent.TimeUnit;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.redisson.api.RedissonClient;
import org.redisson.redisnode.RedissonClusterNodes;
import org.redisson.redisnode.RedissonSentinelMasterSlaveNodes;
import org.redisson.redisnode.RedissonSingleNode;
import org.springframework.boot.actuate.health.Health;
import org.springframework.test.context.junit4.SpringRunner;

import static com.netflix.conductor.redislock.config.RedisLockProperties.REDIS_SERVER_TYPE.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@RunWith(SpringRunner.class)
public class RedisHealthIndicatorTest {

    @Mock private RedissonClient redissonClient;

    @Test
    public void shouldReturnAsHealthWhenServerTypeIsSingle() {
        // Given a Redisson client
        var redisProperties = new RedisLockProperties();
        redisProperties.setServerType(SINGLE);

        // And its mocks
        var redisNode = Mockito.mock(RedissonSingleNode.class);
        when(redissonClient.getRedisNodes(any())).thenReturn(redisNode);
        when(redisNode.pingAll(anyLong(), any(TimeUnit.class))).thenReturn(true);

        // When execute a health indicator
        var actualHealth = new RedisHealthIndicator(redissonClient, redisProperties);

        // Then should return as health
        assertThat(actualHealth.health()).isEqualTo(Health.up().build());
    }

    @Test
    public void shouldReturnAsHealthWhenServerTypeIsCluster() {
        // Given a Redisson client
        var redisProperties = new RedisLockProperties();
        redisProperties.setServerType(CLUSTER);

        // And its mocks
        var redisNode = Mockito.mock(RedissonClusterNodes.class);
        when(redissonClient.getRedisNodes(any())).thenReturn(redisNode);
        when(redisNode.pingAll(anyLong(), any(TimeUnit.class))).thenReturn(true);

        // When execute a health indicator
        var actualHealth = new RedisHealthIndicator(redissonClient, redisProperties);

        // Then should return as health
        assertThat(actualHealth.health()).isEqualTo(Health.up().build());
    }

    @Test
    public void shouldReturnAsHealthWhenServerTypeIsSentinel() {
        // Given a Redisson client
        var redisProperties = new RedisLockProperties();
        redisProperties.setServerType(SENTINEL);

        // And its mocks
        var redisNode = Mockito.mock(RedissonSentinelMasterSlaveNodes.class);
        when(redissonClient.getRedisNodes(any())).thenReturn(redisNode);
        when(redisNode.pingAll(anyLong(), any(TimeUnit.class))).thenReturn(true);

        // When execute a health indicator
        var actualHealth = new RedisHealthIndicator(redissonClient, redisProperties);

        // Then should return as health
        assertThat(actualHealth.health()).isEqualTo(Health.up().build());
    }

    @Test
    public void shouldReturnAsUnhealthyWhenAnyServerIsDown() {
        // Given a Redisson client
        var redisProperties = new RedisLockProperties();
        redisProperties.setServerType(SINGLE);

        // And its mocks
        var redisNode = Mockito.mock(RedissonSingleNode.class);
        when(redissonClient.getRedisNodes(any())).thenReturn(redisNode);
        when(redisNode.pingAll(anyLong(), any(TimeUnit.class))).thenReturn(false);

        // When execute a health indicator
        var actualHealth = new RedisHealthIndicator(redissonClient, redisProperties);

        // Then should return as unhealthy
        assertThat(actualHealth.health()).isEqualTo(Health.down().build());
    }
}
