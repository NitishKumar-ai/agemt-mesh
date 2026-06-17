package com.netflix.conductor.common.utils;

import com.netflix.conductor.common.config.ObjectMapperProvider;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

public class TaskUtils {

    private static final ObjectMapper objectMapper;

    static {
        ObjectMapperProvider provider = new ObjectMapperProvider();
        objectMapper = provider.getObjectMapper();
    }

    private static final String LOOP_TASK_DELIMITER = "__";

    public static String appendIteration(String name, int iteration) {
        return name + LOOP_TASK_DELIMITER + iteration;
    }

    public static String getLoopOverTaskRefNameSuffix(int iteration) {
        return LOOP_TASK_DELIMITER + iteration;
    }

    public static String removeIterationFromTaskRefName(String referenceTaskName) {
        String[] tokens = referenceTaskName.split(TaskUtils.LOOP_TASK_DELIMITER);
        return tokens.length > 0 ? tokens[0] : referenceTaskName;
    }

    public static WorkflowDef convertToWorkflowDef(Object workflowDef) {
        return objectMapper.convertValue(workflowDef, new TypeReference<WorkflowDef>() {});
    }
}
