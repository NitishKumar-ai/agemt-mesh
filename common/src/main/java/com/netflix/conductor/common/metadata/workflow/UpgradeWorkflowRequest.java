package com.netflix.conductor.common.metadata.workflow;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

import jakarta.validation.constraints.NotNull;

@ProtoMessage
public class UpgradeWorkflowRequest {

    public Map<String, Object> getTaskOutput() {
        return taskOutput;
    }

    public void setTaskOutput(Map<String, Object> taskOutput) {
        this.taskOutput = taskOutput;
    }

    public Map<String, Object> getWorkflowInput() {
        return workflowInput;
    }

    public void setWorkflowInput(Map<String, Object> workflowInput) {
        this.workflowInput = workflowInput;
    }

    @ProtoField(id = 4)
    private Map<String, Object> taskOutput;

    @ProtoField(id = 3)
    private Map<String, Object> workflowInput;

    @ProtoField(id = 2)
    private Integer version;

    @NotNull(message = "Workflow name cannot be null or empty")
    @ProtoField(id = 1)
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }
}
