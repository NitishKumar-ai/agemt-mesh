package com.netflix.conductor.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.databind.ObjectMapper;

/** Supplies the standard Conductor {@link ObjectMapper} for tests that need them. */
@Configuration
public class TestObjectMapperConfiguration {

    @Bean
    public ObjectMapper testObjectMapper() {
        return new ObjectMapperProvider().getObjectMapper();
    }
}
