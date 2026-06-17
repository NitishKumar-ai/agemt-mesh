package com.netflix.conductor.common.metadata.workflow;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

@ProtoMessage
public class RerunWorkflowRequest {

    @ProtoField(id = 1)
    private String reRunFromWorkflowId;

    @ProtoField(id = 2)
    private Map<String, Object> workflowInput;

    @ProtoField(id = 3)
    private String reRunFromTaskId;

    @ProtoField(id = 4)
    private Map<String, Object> taskInput;

    @ProtoField(id = 5)
    private String correlationId;

    public String getReRunFromWorkflowId() {
        return reRunFromWorkflowId;
    }

    public void setReRunFromWorkflowId(String reRunFromWorkflowId) {
        this.reRunFromWorkflowId = reRunFromWorkflowId;
    }

    public Map<String, Object> getWorkflowInput() {
        return workflowInput;
    }

    public void setWorkflowInput(Map<String, Object> workflowInput) {
        this.workflowInput = workflowInput;
    }

    public String getReRunFromTaskId() {
        return reRunFromTaskId;
    }

    public void setReRunFromTaskId(String reRunFromTaskId) {
        this.reRunFromTaskId = reRunFromTaskId;
    }

    public Map<String, Object> getTaskInput() {
        return taskInput;
    }

    public void setTaskInput(Map<String, Object> taskInput) {
        this.taskInput = taskInput;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }
}
