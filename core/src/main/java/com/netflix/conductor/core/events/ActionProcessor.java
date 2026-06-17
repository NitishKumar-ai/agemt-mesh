package com.netflix.conductor.core.events;

import java.util.Map;

import com.netflix.conductor.common.metadata.events.EventHandler;

public interface ActionProcessor {

    Map<String, Object> execute(
            EventHandler.Action action, Object payloadObject, String event, String messageId);
}
