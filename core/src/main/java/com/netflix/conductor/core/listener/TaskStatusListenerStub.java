package com.netflix.conductor.core.listener;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.netflix.conductor.model.TaskModel;

/** Stub listener default implementation */
public class TaskStatusListenerStub implements TaskStatusListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(TaskStatusListenerStub.class);

    @Override
    public void onTaskScheduled(TaskModel task) {
        LOGGER.debug("Task {} is scheduled", task.getTaskId());
    }

    @Override
    public void onTaskCanceled(TaskModel task) {
        LOGGER.debug("Task {} is canceled", task.getTaskId());
    }

    @Override
    public void onTaskCompleted(TaskModel task) {
        LOGGER.debug("Task {} is completed", task.getTaskId());
    }

    @Override
    public void onTaskCompletedWithErrors(TaskModel task) {
        LOGGER.debug("Task {} is completed with errors", task.getTaskId());
    }

    @Override
    public void onTaskFailed(TaskModel task) {
        LOGGER.debug("Task {} is failed", task.getTaskId());
    }

    @Override
    public void onTaskFailedWithTerminalError(TaskModel task) {
        LOGGER.debug("Task {} is failed with terminal error", task.getTaskId());
    }

    @Override
    public void onTaskInProgress(TaskModel task) {
        LOGGER.debug("Task {} is in-progress", task.getTaskId());
    }

    @Override
    public void onTaskSkipped(TaskModel task) {
        LOGGER.debug("Task {} is skipped", task.getTaskId());
    }

    @Override
    public void onTaskTimedOut(TaskModel task) {
        LOGGER.debug("Task {} is timed out", task.getTaskId());
    }
}
