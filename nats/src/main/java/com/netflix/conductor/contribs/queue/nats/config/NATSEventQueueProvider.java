package com.netflix.conductor.contribs.queue.nats.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.lang.NonNull;

import com.netflix.conductor.contribs.queue.nats.NATSObservableQueue;
import com.netflix.conductor.core.events.EventQueueProvider;
import com.netflix.conductor.core.events.queue.ObservableQueue;

import rx.Scheduler;

/**
 * @author Oleksiy Lysak
 */
public class NATSEventQueueProvider implements EventQueueProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(NATSEventQueueProvider.class);

    protected Map<String, NATSObservableQueue> queues = new ConcurrentHashMap<>();
    private final Scheduler scheduler;

    public NATSEventQueueProvider(Environment environment, Scheduler scheduler) {
        this.scheduler = scheduler;
        LOGGER.info("NATS Event Queue Provider initialized...");
    }

    @Override
    public String getQueueType() {
        return "nats";
    }

    @Override
    @NonNull
    public ObservableQueue getQueue(String queueURI) {
        NATSObservableQueue queue =
                queues.computeIfAbsent(queueURI, q -> new NATSObservableQueue(queueURI, scheduler));
        if (queue.isClosed()) {
            queue.open();
        }
        return queue;
    }
}
