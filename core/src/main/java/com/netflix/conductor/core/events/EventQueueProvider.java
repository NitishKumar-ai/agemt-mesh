package com.netflix.conductor.core.events;

import org.springframework.lang.NonNull;

import com.netflix.conductor.core.events.queue.ObservableQueue;

public interface EventQueueProvider {

    String getQueueType();

    /**
     * Creates or reads the {@link ObservableQueue} for the given <code>queueURI</code>.
     *
     * @param queueURI The URI of the queue.
     * @return The {@link ObservableQueue} implementation for the <code>queueURI</code>.
     * @throws IllegalArgumentException thrown when an {@link ObservableQueue} can not be created
     *     for the <code>queueURI</code>.
     */
    @NonNull
    ObservableQueue getQueue(String queueURI) throws IllegalArgumentException;
}
