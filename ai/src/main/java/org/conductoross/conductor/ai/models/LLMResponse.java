package org.conductoross.conductor.ai.models;

import java.util.List;

import com.netflix.conductor.common.metadata.workflow.WorkflowDef;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LLMResponse {
    private Object result;
    private List<Media> media;
    private String finishReason;
    private int tokenUsed;
    private int promptTokens;
    private int completionTokens;
    private List<ToolCall> toolCalls;
    private WorkflowDef workflow;
    private String jobId;
    private String responseId;
    private String reasoning;
    private Integer reasoningTokens;

    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }
}
