package com.netflix.conductor.core.execution.tasks;

import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.netflix.conductor.annotations.VisibleForTesting;
import com.netflix.conductor.core.config.ConductorProperties;
import com.netflix.conductor.core.utils.QueueUtils;

import static com.netflix.conductor.core.execution.tasks.SystemTaskRegistry.ASYNC_SYSTEM_TASKS_QUALIFIER;

@Component
@ConditionalOnProperty(
        name = "conductor.system-task-workers.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class SystemTaskWorkerCoordinator {

    private static final Logger LOGGER = LoggerFactory.getLogger(SystemTaskWorkerCoordinator.class);

    private final SystemTaskWorker systemTaskWorker;
    private final String executionNameSpace;
    private final Set<WorkflowSystemTask> asyncSystemTasks;

    public SystemTaskWorkerCoordinator(
            SystemTaskWorker systemTaskWorker,
            ConductorProperties properties,
            @Qualifier(ASYNC_SYSTEM_TASKS_QUALIFIER) Set<WorkflowSystemTask> asyncSystemTasks) {
        this.systemTaskWorker = systemTaskWorker;
        this.asyncSystemTasks = asyncSystemTasks;
        this.executionNameSpace = properties.getSystemTaskWorkerExecutionNamespace();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void initSystemTaskExecutor() {
        this.asyncSystemTasks.stream()
                .filter(this::isFromCoordinatorExecutionNameSpace)
                .forEach(this.systemTaskWorker::startPolling);
        LOGGER.info(
                "{} initialized with {} async tasks",
                SystemTaskWorkerCoordinator.class.getSimpleName(),
                this.asyncSystemTasks.size());
    }

    @VisibleForTesting
    boolean isFromCoordinatorExecutionNameSpace(WorkflowSystemTask systemTask) {
        String queueExecutionNameSpace = QueueUtils.getExecutionNameSpace(systemTask.getTaskType());
        return StringUtils.equals(queueExecutionNameSpace, executionNameSpace);
    }
}
