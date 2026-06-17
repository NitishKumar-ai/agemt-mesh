package com.netflix.conductor.contribs.queue.stan.config;

import java.util.HashMap;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.contribs.queue.stan.NATSStreamObservableQueue;
import com.netflix.conductor.core.config.ConductorProperties;
import com.netflix.conductor.core.events.EventQueueProvider;
import com.netflix.conductor.core.events.queue.ObservableQueue;
import com.netflix.conductor.model.TaskModel;

import rx.Scheduler;

@Configuration
@EnableConfigurationProperties(NATSStreamProperties.class)
@ConditionalOnProperty(name = "conductor.event-queues.nats-stream.enabled", havingValue = "true")
public class NATSStreamConfiguration {

    @Bean
    public EventQueueProvider natsEventQueueProvider(
            NATSStreamProperties properties, Scheduler scheduler) {
        return new NATSStreamEventQueueProvider(properties, scheduler);
    }

    @ConditionalOnProperty(name = "conductor.default-event-queue.type", havingValue = "nats_stream")
    @Bean
    public Map<TaskModel.Status, ObservableQueue> getQueues(
            ConductorProperties conductorProperties,
            NATSStreamProperties properties,
            Scheduler scheduler) {
        String stack = "";
        if (conductorProperties.getStack() != null && conductorProperties.getStack().length() > 0) {
            stack = conductorProperties.getStack() + "_";
        }
        TaskModel.Status[] statuses =
                new TaskModel.Status[] {TaskModel.Status.COMPLETED, TaskModel.Status.FAILED};
        Map<TaskModel.Status, ObservableQueue> queues = new HashMap<>();
        for (TaskModel.Status status : statuses) {
            String queuePrefix =
                    StringUtils.isBlank(properties.getListenerQueuePrefix())
                            ? conductorProperties.getAppId() + "_nats_stream_notify_" + stack
                            : properties.getListenerQueuePrefix();

            String queueName = queuePrefix + status.name() + getQueueGroup(properties);

            ObservableQueue queue =
                    new NATSStreamObservableQueue(
                            properties.getClusterId(),
                            properties.getUrl(),
                            properties.getDurableName(),
                            queueName,
                            scheduler);
            queues.put(status, queue);
        }

        return queues;
    }

    private String getQueueGroup(final NATSStreamProperties properties) {
        if (properties.getDefaultQueueGroup() == null
                || properties.getDefaultQueueGroup().isBlank()) {
            return "";
        }
        return ":" + properties.getDefaultQueueGroup();
    }
}
