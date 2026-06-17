package org.conductoross.conductor.model;

import java.util.Map;

import lombok.Data;

@Data
public abstract class SignalResponse {

    private WorkflowSignalReturnStrategy responseType;
    private String targetWorkflowId;
    private String targetWorkflowStatus;

    private String requestId;
    private String workflowId;
    private String correlationId;
    private Map<String, Object> input;
    private Map<String, Object> output;
}
