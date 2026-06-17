package com.netflix.conductor.common.config;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_IGNORED_PROPERTIES;
import static com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES;
import static com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES;

@Configuration
public class ObjectMapperBuilderConfiguration {

    /** Disable features like {@link ObjectMapperProvider#getObjectMapper()}. */
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer conductorJackson2ObjectMapperBuilderCustomizer() {
        return builder ->
                builder.featuresToDisable(
                        FAIL_ON_UNKNOWN_PROPERTIES,
                        FAIL_ON_IGNORED_PROPERTIES,
                        FAIL_ON_NULL_FOR_PRIMITIVES);
    }
}
