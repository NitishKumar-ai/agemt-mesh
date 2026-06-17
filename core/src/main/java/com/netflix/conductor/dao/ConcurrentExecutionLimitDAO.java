package com.netflix.conductor.dao;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.model.TaskModel;

/**
 * A contract to support concurrency limits of tasks.
 *
 * @since v3.3.5.
 */
public interface ConcurrentExecutionLimitDAO {

    default void addTaskToLimit(TaskModel task) {
        throw new UnsupportedOperationException(
                getClass() + " does not support addTaskToLimit method.");
    }

    default void removeTaskFromLimit(TaskModel task) {
        throw new UnsupportedOperationException(
                getClass() + " does not support removeTaskFromLimit method.");
    }

    /**
     * Checks if the number of tasks in progress for the given taskDef will exceed the limit if the
     * task is scheduled to be in progress (given to the worker or for system tasks start() method
     * called)
     *
     * @param task The task to be executed. Limit is set in the Task's definition
     * @return true if by executing this task, the limit is breached. false otherwise.
     * @see TaskDef#concurrencyLimit()
     */
    boolean exceedsLimit(TaskModel task);
}
