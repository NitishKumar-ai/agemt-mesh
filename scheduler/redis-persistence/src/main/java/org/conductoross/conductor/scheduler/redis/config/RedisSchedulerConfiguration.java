package org.conductoross.conductor.scheduler.redis.config;

import org.conductoross.conductor.scheduler.redis.dao.RedisSchedulerArchivalDAO;
import org.conductoross.conductor.scheduler.redis.dao.RedisSchedulerCacheDAO;
import org.conductoross.conductor.scheduler.redis.dao.RedisSchedulerDAO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.config.ConductorProperties;
import com.netflix.conductor.redis.config.AnyRedisCondition;
import com.netflix.conductor.redis.config.RedisProperties;
import com.netflix.conductor.redis.jedis.JedisProxy;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.orkes.conductor.dao.archive.SchedulerArchivalDAO;
import io.orkes.conductor.dao.scheduler.SchedulerCacheDAO;
import io.orkes.conductor.dao.scheduler.SchedulerDAO;

@Configuration(proxyBeanMethods = false)
@Conditional(AnyRedisCondition.class)
public class RedisSchedulerConfiguration {

    @Bean
    @ConditionalOnProperty(
            name = "conductor.scheduler.cache.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public SchedulerCacheDAO redisSchedulerCacheDAO(
            JedisProxy jedisProxy,
            ObjectMapper objectMapper,
            ConductorProperties conductorProperties,
            RedisProperties redisProperties) {
        return new RedisSchedulerCacheDAO(
                jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    @Bean
    @ConditionalOnProperty(
            name = "conductor.scheduler.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public SchedulerDAO redisSchedulerDAO(
            JedisProxy jedisProxy,
            ObjectMapper objectMapper,
            ConductorProperties conductorProperties,
            RedisProperties redisProperties) {
        return new RedisSchedulerDAO(
                jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    @Bean
    @ConditionalOnProperty(
            name = "conductor.scheduler.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public SchedulerArchivalDAO redisSchedulerArchivalDAO(
            JedisProxy jedisProxy,
            ObjectMapper objectMapper,
            ConductorProperties conductorProperties,
            RedisProperties redisProperties,
            @Value("${conductor.scheduler.redis.archival-ttl-days:7}") int archivalTtlDays) {
        long ttlSeconds = archivalTtlDays * 24L * 60 * 60;
        return new RedisSchedulerArchivalDAO(
                jedisProxy, objectMapper, conductorProperties, redisProperties, ttlSeconds);
    }
}
