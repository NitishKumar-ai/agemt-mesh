package com.netflix.conductor.common.config;

import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.module.afterburner.AfterburnerModule;
import jakarta.annotation.PostConstruct;

@Configuration
public class ObjectMapperConfiguration {

    private final ObjectMapper objectMapper;

    public ObjectMapperConfiguration(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** Set default property inclusion like {@link ObjectMapperProvider#getObjectMapper()}. */
    @PostConstruct
    public void customizeDefaultObjectMapper() {
        objectMapper.setDefaultPropertyInclusion(
                JsonInclude.Value.construct(
                        JsonInclude.Include.NON_NULL, JsonInclude.Include.ALWAYS));
        objectMapper.registerModule(new AfterburnerModule());
    }
}
