package com.netflix.conductor.core.events;

import java.util.Map;

public interface EventQueueManager {

    Map<String, String> getQueues();

    Map<String, Map<String, Long>> getQueueSizes();
}
