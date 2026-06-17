package com.netflix.conductor.contribs.listener;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.core.dal.ExecutionDAOFacade;
import com.netflix.conductor.core.listener.TaskStatusListener;

@Configuration
@EnableConfigurationProperties(StatusNotifierNotificationProperties.class)
@ConditionalOnProperty(name = "conductor.task-status-listener.type", havingValue = "task_publisher")
public class TaskStatusPublisherConfiguration {

    @Bean
    public TaskStatusListener getTaskStatusListener(
            RestClientManager rcm,
            ExecutionDAOFacade executionDAOFacade,
            StatusNotifierNotificationProperties config) {

        return new TaskStatusPublisher(rcm, executionDAOFacade, config.getSubscribedTaskStatuses());
    }
}
