package io.orkes.conductor.scheduler.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public class SchedulerConditions extends AllNestedConditions {

    public SchedulerConditions() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @SuppressWarnings("unused")
    @ConditionalOnProperty(
            name = "conductor.scheduler.enabled",
            havingValue = "true",
            matchIfMissing = false)
    static class SchedulerEnabled {}
}
