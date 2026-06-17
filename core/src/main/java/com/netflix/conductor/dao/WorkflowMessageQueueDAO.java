package com.netflix.conductor.dao;

import java.util.List;

import com.netflix.conductor.common.model.WorkflowMessage;

/**
 * DAO for the per-workflow message queue used by the Workflow Message Queue (WMQ) feature.
 *
 * <p>Each workflow has at most one queue, identified by its workflow ID. Messages are ordered FIFO.
 * Implementations must guarantee that {@link #pop} is atomic — concurrent callers must not receive
 * overlapping messages.
 */
public interface WorkflowMessageQueueDAO {

    /**
     * Append a message to the tail of the workflow's queue.
     *
     * @param workflowId the target workflow instance ID
     * @param message the message to enqueue
     * @throws IllegalStateException if the queue has reached the configured maximum size
     */
    void push(String workflowId, WorkflowMessage message);

    /**
     * Atomically remove and return up to {@code maxCount} messages from the head of the queue.
     *
     * <p>Returns an empty list (never null) if the queue is empty.
     *
     * @param workflowId the target workflow instance ID
     * @param maxCount maximum number of messages to return; must be &gt;= 1
     * @return dequeued messages, oldest first
     */
    List<WorkflowMessage> pop(String workflowId, int maxCount);

    /**
     * Return the current number of messages in the queue without removing any.
     *
     * @param workflowId the target workflow instance ID
     * @return queue depth, or 0 if the queue does not exist
     */
    long size(String workflowId);

    /**
     * Delete the entire queue for the given workflow. Called on workflow termination. Safe to call
     * if no queue exists (no-op).
     *
     * @param workflowId the workflow instance ID whose queue should be removed
     */
    void delete(String workflowId);
}
