package com.netflix.conductor.metrics;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Spring component that registers all available {@link MeterRegistry} instances with {@link
 * Monitors} at startup. Monitors owns the composite registry; this class is purely a wiring point
 * between Spring-managed registries and the static Monitors API.
 */
@Slf4j
@Component
public class MetricsCollector {

    public MetricsCollector(MeterRegistry... registries) {
        log.info("=========");
        log.info("Conductor configured with {} metrics registries", registries.length);
        for (MeterRegistry registry : registries) {
            log.info("Metrics registry: {}", registry);
            Monitors.addMeterRegistry(registry);
        }
        log.info(
                "check https://docs.micrometer.io/micrometer/reference/ for configuration options");
        log.info("=========");
    }

    /**
     * @deprecated Use {@link Monitors#getRegistry()} directly.
     */
    @Deprecated
    public static MeterRegistry getMeterRegistry() {
        return Monitors.getRegistry();
    }
}
