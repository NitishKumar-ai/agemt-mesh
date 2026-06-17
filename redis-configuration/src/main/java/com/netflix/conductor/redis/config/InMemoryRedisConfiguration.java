package com.netflix.conductor.redis.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.redis.jedis.InMemoryJedisCommands;
import com.netflix.conductor.redis.jedis.JedisCommands;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "conductor.db.type", havingValue = "memory")
public class InMemoryRedisConfiguration {

    @Bean
    public JedisCommands jedisCommands() {
        return new InMemoryJedisCommands();
    }
}
