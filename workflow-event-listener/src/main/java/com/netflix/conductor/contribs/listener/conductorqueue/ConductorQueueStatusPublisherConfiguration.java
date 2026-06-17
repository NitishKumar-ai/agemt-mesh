package com.netflix.conductor.contribs.listener.conductorqueue;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.listener.WorkflowStatusListener;
import com.netflix.conductor.dao.QueueDAO;

import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
@EnableConfigurationProperties(ConductorQueueStatusPublisherProperties.class)
@ConditionalOnProperty(
        name = "conductor.workflow-status-listener.type",
        havingValue = "queue_publisher")
public class ConductorQueueStatusPublisherConfiguration {

    @Bean
    public WorkflowStatusListener getWorkflowStatusListener(
            QueueDAO queueDAO,
            ConductorQueueStatusPublisherProperties properties,
            ObjectMapper objectMapper) {
        return new ConductorQueueStatusPublisher(queueDAO, objectMapper, properties);
    }
}
