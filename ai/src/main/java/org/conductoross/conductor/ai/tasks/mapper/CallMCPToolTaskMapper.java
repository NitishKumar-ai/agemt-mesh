package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.MCPToolCallRequest;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

/** Task mapper for CALL_MCP_TOOL task type. */
@Component
@Conditional(AIIntegrationEnabledCondition.class)
public class CallMCPToolTaskMapper extends AIModelTaskMapper<MCPToolCallRequest> {

    public static final String TASK_TYPE = "CALL_MCP_TOOL";

    public CallMCPToolTaskMapper() {
        super(TASK_TYPE);
    }
}
