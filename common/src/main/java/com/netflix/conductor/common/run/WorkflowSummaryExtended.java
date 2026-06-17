package com.netflix.conductor.common.run;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Extended version of WorkflowSummary that retains input/output as Map */
public class WorkflowSummaryExtended extends WorkflowSummary {

    @ProtoField(id = 9) // Ensure Protobuf compatibility
    @JsonIgnore
    private Map<String, Object> inputMap;

    @ProtoField(id = 10)
    @JsonIgnore
    private Map<String, Object> outputMap;

    public WorkflowSummaryExtended(Workflow workflow) {
        super(workflow);
        if (workflow.getInput() != null) {
            this.inputMap = workflow.getInput();
        }
        if (workflow.getOutput() != null) {
            this.outputMap = workflow.getOutput();
        }
    }

    /** New method for JSON serialization */
    @JsonProperty("input")
    public Map<String, Object> getInputMap() {
        return inputMap;
    }

    /** New method for JSON serialization */
    @JsonProperty("output")
    public Map<String, Object> getOutputMap() {
        return outputMap;
    }

    public void setInputMap(Map<String, Object> inputMap) {
        this.inputMap = inputMap;
    }

    public void setOutputMap(Map<String, Object> outputMap) {
        this.outputMap = outputMap;
    }
}
