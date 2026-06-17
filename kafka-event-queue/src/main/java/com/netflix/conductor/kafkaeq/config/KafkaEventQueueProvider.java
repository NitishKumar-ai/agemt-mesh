package com.netflix.conductor.kafkaeq.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.netflix.conductor.core.events.EventQueueProvider;
import com.netflix.conductor.core.events.queue.ObservableQueue;
import com.netflix.conductor.kafkaeq.eventqueue.KafkaObservableQueue.Builder;

public class KafkaEventQueueProvider implements EventQueueProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(KafkaEventQueueProvider.class);

    private final Map<String, ObservableQueue> queues = new ConcurrentHashMap<>();
    private final KafkaEventQueueProperties properties;

    public KafkaEventQueueProvider(KafkaEventQueueProperties properties) {
        this.properties = properties;
    }

    @Override
    public String getQueueType() {
        return "kafka";
    }

    @Override
    public ObservableQueue getQueue(String queueURI) {
        LOGGER.info("Creating KafkaObservableQueue for topic: {}", queueURI);

        return queues.computeIfAbsent(queueURI, q -> new Builder(properties).build(queueURI, null));
    }
}
