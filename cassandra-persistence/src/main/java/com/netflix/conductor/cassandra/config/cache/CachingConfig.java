package com.netflix.conductor.cassandra.config.cache;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableCaching
public class CachingConfig {
    public static final String TASK_DEF_CACHE = "taskDefCache";
    public static final String EVENT_HANDLER_CACHE = "eventHandlerCache";

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager(TASK_DEF_CACHE, EVENT_HANDLER_CACHE);
    }
}
