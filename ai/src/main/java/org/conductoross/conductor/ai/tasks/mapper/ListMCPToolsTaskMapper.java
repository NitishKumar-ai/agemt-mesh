package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.MCPListToolsRequest;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

/** Task mapper for LIST_MCP_TOOLS task type. */
@Component
@Conditional(AIIntegrationEnabledCondition.class)
public class ListMCPToolsTaskMapper extends AIModelTaskMapper<MCPListToolsRequest> {

    public static final String TASK_TYPE = "LIST_MCP_TOOLS";

    public ListMCPToolsTaskMapper() {
        super(TASK_TYPE);
    }
}
