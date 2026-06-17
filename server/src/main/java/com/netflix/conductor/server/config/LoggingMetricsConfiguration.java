package com.netflix.conductor.server.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.logging.LoggingMeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Metrics logging reporter, dumping all metrics into an Slf4J logger.
 *
 * <p>Enable in config: conductor.metrics-logger.enabled=true
 *
 * <p>additional config: conductor.metrics-logger.reportInterval=15s
 */
@ConditionalOnProperty(value = "conductor.metrics-logger.enabled", havingValue = "true")
@Configuration
@Slf4j
public class LoggingMetricsConfiguration {

    @Bean
    public MeterRegistry getLoggingMeterRegistry() {
        return new LoggingMeterRegistry(log::info);
    }
}
