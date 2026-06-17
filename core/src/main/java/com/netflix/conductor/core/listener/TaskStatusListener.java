package com.netflix.conductor.core.listener;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.model.TaskModel;

/**
 * Listener for the Task status change. All methods have default implementation so that
 * Implementation can choose to override a subset of interested Task statuses.
 */
public interface TaskStatusListener {

    default void onTaskScheduledIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskScheduled(task);
        }
    }

    default void onTaskInProgressIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskInProgress(task);
        }
    }

    default void onTaskCanceledIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskCanceled(task);
        }
    }

    default void onTaskFailedIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskFailed(task);
        }
    }

    default void onTaskFailedWithTerminalErrorIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskFailedWithTerminalError(task);
        }
    }

    default void onTaskCompletedIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskCompleted(task);
        }
    }

    default void onTaskCompletedWithErrorsIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskCompletedWithErrors(task);
        }
    }

    default void onTaskTimedOutIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskTimedOut(task);
        }
    }

    default void onTaskSkippedIfEnabled(TaskModel task) {
        if (isTaskStatusListenerEnabled(task)) {
            onTaskSkipped(task);
        }
    }

    default void onTaskScheduled(TaskModel task) {}

    default void onTaskInProgress(TaskModel task) {}

    default void onTaskCanceled(TaskModel task) {}

    default void onTaskFailed(TaskModel task) {}

    default void onTaskFailedWithTerminalError(TaskModel task) {}

    default void onTaskCompleted(TaskModel task) {}

    default void onTaskCompletedWithErrors(TaskModel task) {}

    default void onTaskTimedOut(TaskModel task) {}

    default void onTaskSkipped(TaskModel task) {}

    private boolean isTaskStatusListenerEnabled(TaskModel task) {
        return task.getTaskDefinition().map(TaskDef::isTaskStatusListenerEnabled).orElse(true);
    }
}
