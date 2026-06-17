package com.netflix.conductor.metrics;

import org.junit.Test;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import static org.junit.Assert.*;

public class MetricsCollectorTest {

    @Test
    public void constructor_wiresRegistryIntoMonitors() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        new MetricsCollector(registry);

        Monitors.getCounter("mc_test_counter", "source", "test").increment(7);

        Counter counter = registry.find("mc_test_counter").counter();
        assertNotNull("Counter should be visible in the wired registry", counter);
        assertEquals(7.0, counter.count(), 0.001);
    }

    @Test
    public void getMeterRegistry_delegatesToMonitors() {
        assertSame(Monitors.getRegistry(), MetricsCollector.getMeterRegistry());
    }
}
