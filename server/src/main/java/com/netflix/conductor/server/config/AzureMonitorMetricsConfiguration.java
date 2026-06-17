package com.netflix.conductor.server.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.azuremonitor.AzureMonitorConfig;
import io.micrometer.azuremonitor.AzureMonitorMeterRegistry;
import io.micrometer.core.instrument.Clock;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

@ConditionalOnProperty(
        value = "management.azuremonitor.metrics.export.enabled",
        havingValue = "true")
@Configuration
@Slf4j
public class AzureMonitorMetricsConfiguration {

    @Bean
    public MeterRegistry getAzureMonitorMeterRegistry(
            @Value("${management.azuremonitor.metrics.export.instrumentationKey:null}")
                    String instrumentationKey) {
        AzureMonitorConfig azureMonitorConfig =
                new AzureMonitorConfig() {
                    @Override
                    public String instrumentationKey() {
                        return instrumentationKey;
                    }

                    @Override
                    public String get(String key) {
                        return null;
                    }
                };
        return new AzureMonitorMeterRegistry(azureMonitorConfig, Clock.SYSTEM);
    }
}
