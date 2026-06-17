package com.netflix.conductor.contribs.listener.kafka;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.listener.WorkflowStatusListener;

import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
@EnableConfigurationProperties(KafkaWorkflowStatusPublisherProperties.class)
@ConditionalOnProperty(name = "conductor.workflow-status-listener.type", havingValue = "kafka")
public class KafkaWorkflowStatusPublisherConfiguration {

    @Bean
    public WorkflowStatusListener getWorkflowStatusListener(
            KafkaWorkflowStatusPublisherProperties properties, ObjectMapper objectMapper) {
        return new KafkaWorkflowStatusPublisher(properties, objectMapper);
    }
}
