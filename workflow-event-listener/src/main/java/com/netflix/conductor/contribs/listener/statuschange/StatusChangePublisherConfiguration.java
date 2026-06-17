package com.netflix.conductor.contribs.listener.statuschange;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.contribs.listener.RestClientManager;
import com.netflix.conductor.contribs.listener.StatusNotifierNotificationProperties;
import com.netflix.conductor.core.dal.ExecutionDAOFacade;
import com.netflix.conductor.core.listener.WorkflowStatusListener;

@Configuration
@EnableConfigurationProperties(StatusNotifierNotificationProperties.class)
@ConditionalOnProperty(
        name = "conductor.workflow-status-listener.type",
        havingValue = "workflow_publisher")
public class StatusChangePublisherConfiguration {

    private static final Logger log =
            LoggerFactory.getLogger(StatusChangePublisherConfiguration.class);

    @Bean
    public RestClientManager getRestClientManager(StatusNotifierNotificationProperties config) {
        return new RestClientManager(config);
    }

    @Bean
    public WorkflowStatusListener getWorkflowStatusListener(
            RestClientManager restClientManager,
            ExecutionDAOFacade executionDAOFacade,
            StatusNotifierNotificationProperties config) {

        return new StatusChangePublisher(
                restClientManager, executionDAOFacade, config.getSubscribedWorkflowStatuses());
    }
}
