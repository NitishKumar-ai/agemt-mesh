package com.netflix.conductor.contribs.queue.stan.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import com.netflix.conductor.core.events.EventQueueProvider;

import rx.Scheduler;

@Configuration
@ConditionalOnProperty(name = "conductor.event-queues.nats.enabled", havingValue = "true")
public class NATSConfiguration {

    @Bean
    public EventQueueProvider natsEventQueueProvider(Environment environment, Scheduler scheduler) {
        return new NATSEventQueueProvider(environment, scheduler);
    }
}
