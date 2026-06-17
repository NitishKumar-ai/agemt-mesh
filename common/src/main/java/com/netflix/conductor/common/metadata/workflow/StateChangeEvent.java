package com.netflix.conductor.common.metadata.workflow;

import java.util.Map;

import com.netflix.conductor.annotations.protogen.ProtoField;
import com.netflix.conductor.annotations.protogen.ProtoMessage;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@Valid
@ProtoMessage
public class StateChangeEvent {

    @ProtoField(id = 1)
    @NotNull
    private String type;

    @ProtoField(id = 2)
    private Map<String, Object> payload;

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    @Override
    public String toString() {
        return "StateChangeEvent{" + "type='" + type + '\'' + ", payload=" + payload + '}';
    }
}
