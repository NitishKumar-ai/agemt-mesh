package org.conductoross.conductor.ai.models;

import java.util.Map;

import com.netflix.conductor.common.metadata.tasks.TaskType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ToolCall {
    private String taskReferenceName;
    private String name;
    private Map<String, String> integrationNames;
    private String type = TaskType.TASK_TYPE_SIMPLE;
    private Map<String, Object> inputParameters;
    private Map<String, Object> output;
}
