package com.netflix.conductor.core.execution.tasks;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

/**
 * A container class that holds a mapping of system task types {@link
 * com.netflix.conductor.common.metadata.tasks.TaskType} to {@link WorkflowSystemTask} instances.
 */
@Component
@DependsOn("workerTaskAnnotationScanner")
public class SystemTaskRegistry {

    public static final String ASYNC_SYSTEM_TASKS_QUALIFIER = "asyncSystemTasks";

    private final Map<String, WorkflowSystemTask> registry;

    public SystemTaskRegistry(Set<WorkflowSystemTask> tasks) {
        this.registry =
                tasks.stream()
                        .collect(
                                Collectors.toMap(
                                        WorkflowSystemTask::getTaskType, Function.identity()));
    }

    public WorkflowSystemTask get(String taskType) {
        return Optional.ofNullable(registry.get(taskType))
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        taskType + "not found in " + getClass().getSimpleName()));
    }

    public boolean isSystemTask(String taskType) {
        return registry.containsKey(taskType);
    }
}
