package com.netflix.conductor.core.index;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.dao.IndexDAO;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "conductor.indexing.enabled", havingValue = "false")
public class NoopIndexDAOConfiguration {

    @Bean
    public IndexDAO noopIndexDAO() {
        return new NoopIndexDAO();
    }
}
