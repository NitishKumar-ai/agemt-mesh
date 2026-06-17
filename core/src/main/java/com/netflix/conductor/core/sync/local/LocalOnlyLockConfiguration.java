package com.netflix.conductor.core.sync.local;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.sync.Lock;

@Configuration
@ConditionalOnProperty(name = "conductor.workflow-execution-lock.type", havingValue = "local_only")
public class LocalOnlyLockConfiguration {

    @Bean
    public Lock provideLock() {
        return new LocalOnlyLock();
    }
}
