package com.netflix.conductor.contribs.queue.stan.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;

import com.netflix.conductor.contribs.queue.stan.NATSStreamObservableQueue;
import com.netflix.conductor.core.events.EventQueueProvider;
import com.netflix.conductor.core.events.queue.ObservableQueue;

import rx.Scheduler;

/**
 * @author Oleksiy Lysak
 */
public class NATSStreamEventQueueProvider implements EventQueueProvider {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(NATSStreamEventQueueProvider.class);
    protected final Map<String, NATSStreamObservableQueue> queues = new ConcurrentHashMap<>();
    private final String durableName;
    private final String clusterId;
    private final String natsUrl;
    private final Scheduler scheduler;

    public NATSStreamEventQueueProvider(NATSStreamProperties properties, Scheduler scheduler) {
        LOGGER.info("NATS Stream Event Queue Provider init");
        this.scheduler = scheduler;

        // Get NATS Streaming options
        clusterId = properties.getClusterId();
        durableName = properties.getDurableName();
        natsUrl = properties.getUrl();

        LOGGER.info(
                "NATS Streaming clusterId="
                        + clusterId
                        + ", natsUrl="
                        + natsUrl
                        + ", durableName="
                        + durableName);
        LOGGER.info("NATS Stream Event Queue Provider initialized...");
    }

    @Override
    public String getQueueType() {
        return "nats_stream";
    }

    @Override
    @NonNull
    public ObservableQueue getQueue(String queueURI) {
        NATSStreamObservableQueue queue =
                queues.computeIfAbsent(
                        queueURI,
                        q ->
                                new NATSStreamObservableQueue(
                                        clusterId, natsUrl, durableName, queueURI, scheduler));
        if (queue.isClosed()) {
            queue.open();
        }
        return queue;
    }
}
