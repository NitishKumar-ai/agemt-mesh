package com.netflix.conductor.sqs.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.lang.NonNull;

import com.netflix.conductor.core.events.EventQueueProvider;
import com.netflix.conductor.core.events.queue.ObservableQueue;
import com.netflix.conductor.sqs.eventqueue.SQSObservableQueue;

import rx.Scheduler;
import software.amazon.awssdk.services.sqs.SqsClient;

public class SQSEventQueueProvider implements EventQueueProvider {

    private final Map<String, ObservableQueue> queues = new ConcurrentHashMap<>();
    private final SqsClient client;
    private final int batchSize;
    private final long pollTimeInMS;
    private final int visibilityTimeoutInSeconds;
    private final Scheduler scheduler;

    public SQSEventQueueProvider(
            SqsClient client, SQSEventQueueProperties properties, Scheduler scheduler) {
        this.client = client;
        this.batchSize = properties.getBatchSize();
        this.pollTimeInMS = properties.getPollTimeDuration().toMillis();
        this.visibilityTimeoutInSeconds = (int) properties.getVisibilityTimeout().getSeconds();
        this.scheduler = scheduler;
    }

    @Override
    public String getQueueType() {
        return "sqs";
    }

    @Override
    @NonNull
    public ObservableQueue getQueue(String queueURI) {
        return queues.computeIfAbsent(
                queueURI,
                q ->
                        new SQSObservableQueue.Builder()
                                .withBatchSize(this.batchSize)
                                .withClient(client)
                                .withPollTimeInMS(this.pollTimeInMS)
                                .withQueueName(queueURI)
                                .withVisibilityTimeout(this.visibilityTimeoutInSeconds)
                                .withScheduler(scheduler)
                                .build());
    }
}
