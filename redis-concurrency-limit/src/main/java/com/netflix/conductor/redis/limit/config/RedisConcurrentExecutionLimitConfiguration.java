package com.netflix.conductor.redis.limit.config;

import java.util.List;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisClusterConfiguration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.jedis.JedisClientConfiguration;
import org.springframework.data.redis.connection.jedis.JedisConnectionFactory;

@Configuration
@ConditionalOnProperty(
        value = "conductor.redis-concurrent-execution-limit.enabled",
        havingValue = "true")
@EnableConfigurationProperties(RedisConcurrentExecutionLimitProperties.class)
public class RedisConcurrentExecutionLimitConfiguration {

    @Bean
    @ConditionalOnProperty(
            value = "conductor.redis-concurrent-execution-limit.type",
            havingValue = "cluster")
    public RedisConnectionFactory redisClusterConnectionFactory(
            RedisConcurrentExecutionLimitProperties properties) {
        GenericObjectPoolConfig<?> poolConfig = new GenericObjectPoolConfig<>();
        poolConfig.setMaxTotal(properties.getMaxConnectionsPerHost());
        poolConfig.setTestWhileIdle(true);
        JedisClientConfiguration clientConfig =
                JedisClientConfiguration.builder()
                        .usePooling()
                        .poolConfig(poolConfig)
                        .and()
                        .clientName(properties.getClientName())
                        .build();

        RedisClusterConfiguration redisClusterConfiguration =
                new RedisClusterConfiguration(
                        List.of(properties.getHost() + ":" + properties.getPort()));

        return new JedisConnectionFactory(redisClusterConfiguration, clientConfig);
    }

    @Bean
    @ConditionalOnProperty(
            value = "conductor.redis-concurrent-execution-limit.type",
            havingValue = "standalone",
            matchIfMissing = true)
    public RedisConnectionFactory redisStandaloneConnectionFactory(
            RedisConcurrentExecutionLimitProperties properties) {
        RedisStandaloneConfiguration config =
                new RedisStandaloneConfiguration(properties.getHost(), properties.getPort());
        return new JedisConnectionFactory(config);
    }
}
