package com.netflix.conductor.core.events;

import org.springframework.lang.NonNull;

import com.netflix.conductor.core.events.queue.ObservableQueue;

public class MockQueueProvider implements EventQueueProvider {

    private final String type;

    public MockQueueProvider(String type) {
        this.type = type;
    }

    @Override
    public String getQueueType() {
        return "mock";
    }

    @Override
    @NonNull
    public ObservableQueue getQueue(String queueURI) {
        return new MockObservableQueue(queueURI, queueURI, type);
    }
}
