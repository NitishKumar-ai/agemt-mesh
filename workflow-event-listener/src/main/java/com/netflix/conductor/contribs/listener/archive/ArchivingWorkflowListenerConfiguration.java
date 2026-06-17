package com.netflix.conductor.contribs.listener.archive;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.dal.ExecutionDAOFacade;
import com.netflix.conductor.core.listener.WorkflowStatusListener;

@Configuration
@EnableConfigurationProperties(ArchivingWorkflowListenerProperties.class)
@ConditionalOnProperty(name = "conductor.workflow-status-listener.type", havingValue = "archive")
public class ArchivingWorkflowListenerConfiguration {

    @Bean
    public WorkflowStatusListener getWorkflowStatusListener(
            ExecutionDAOFacade executionDAOFacade, ArchivingWorkflowListenerProperties properties) {
        if (properties.getTtlDuration().getSeconds() > 0) {
            return new ArchivingWithTTLWorkflowStatusListener(executionDAOFacade, properties);
        } else if (properties.getWorkflowArchivalType()
                == ArchivingWorkflowListenerProperties.ArchivalType.S3) {
            return new ArchivingWorkflowToS3(executionDAOFacade, properties);
        } else {
            return new ArchivingWorkflowStatusListener(executionDAOFacade);
        }
    }
}
