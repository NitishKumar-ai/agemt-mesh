package org.conductoross.conductor.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public class AIIntegrationEnabledCondition extends AllNestedConditions {
    public AIIntegrationEnabledCondition() {
        super(ConfigurationPhase.PARSE_CONFIGURATION);
    }

    @ConditionalOnProperty(
            name = "conductor.integrations.ai.enabled",
            havingValue = "true",
            matchIfMissing = false)
    static class AIIntegrationsEnabled {}
}
