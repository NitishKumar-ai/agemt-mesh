package com.netflix.conductor.service;

import java.util.List;
import java.util.Map;

import org.springframework.validation.annotation.Validated;

import com.netflix.conductor.common.metadata.tasks.Task;

import jakarta.validation.constraints.NotEmpty;

@Validated
public interface AdminService {

    /**
     * Queue up all the running workflows for sweep.
     *
     * @param workflowId Id of the workflow
     * @return the id of the workflow instance that can be use for tracking.
     */
    String requeueSweep(
            @NotEmpty(message = "WorkflowId cannot be null or empty.") String workflowId);

    /**
     * Get all the configuration parameters.
     *
     * @return all the configuration parameters.
     */
    Map<String, Object> getAllConfig();

    /**
     * Get the list of pending tasks for a given task type.
     *
     * @param taskType Name of the task
     * @param start Start index of pagination
     * @param count Number of entries
     * @return list of pending {@link Task}
     */
    List<Task> getListOfPendingTask(
            @NotEmpty(message = "TaskType cannot be null or empty.") String taskType,
            Integer start,
            Integer count);

    /**
     * Verify that the Workflow is consistent, and run repairs as needed.
     *
     * @param workflowId id of the workflow to be returned
     * @return true, if repair was successful
     */
    boolean verifyAndRepairWorkflowConsistency(
            @NotEmpty(message = "WorkflowId cannot be null or empty.") String workflowId);

    /**
     * Get registered queues.
     *
     * @param verbose `true|false` for verbose logs
     * @return map of event queues
     */
    Map<String, ?> getEventQueues(boolean verbose);
}
