package com.netflix.conductor.common.metadata.workflow;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

import com.google.protobuf.Any;
import io.swagger.v3.oas.annotations.Hidden;

@ProtoMessage(toProto = false)
public class SkipTaskRequest {

    @ProtoField(id = 1)
    private Map<String, Object> taskInput;

    @ProtoField(id = 2)
    private Map<String, Object> taskOutput;

    @ProtoField(id = 3)
    @Hidden
    private Any taskInputMessage;

    @ProtoField(id = 4)
    @Hidden
    private Any taskOutputMessage;

    public Map<String, Object> getTaskInput() {
        return taskInput;
    }

    public void setTaskInput(Map<String, Object> taskInput) {
        this.taskInput = taskInput;
    }

    public Map<String, Object> getTaskOutput() {
        return taskOutput;
    }

    public void setTaskOutput(Map<String, Object> taskOutput) {
        this.taskOutput = taskOutput;
    }

    public Any getTaskInputMessage() {
        return taskInputMessage;
    }

    public void setTaskInputMessage(Any taskInputMessage) {
        this.taskInputMessage = taskInputMessage;
    }

    public Any getTaskOutputMessage() {
        return taskOutputMessage;
    }

    public void setTaskOutputMessage(Any taskOutputMessage) {
        this.taskOutputMessage = taskOutputMessage;
    }
}
