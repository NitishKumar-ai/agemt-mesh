package com.netflix.conductor.core.exception;

import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.model.WorkflowModel.Status.FAILED;

public class TerminateWorkflowException extends RuntimeException {

    private final WorkflowModel.Status workflowStatus;
    private final TaskModel task;

    public TerminateWorkflowException(String reason) {
        this(reason, FAILED);
    }

    public TerminateWorkflowException(String reason, WorkflowModel.Status workflowStatus) {
        this(reason, workflowStatus, null);
    }

    public TerminateWorkflowException(
            String reason, WorkflowModel.Status workflowStatus, TaskModel task) {
        super(reason);
        this.workflowStatus = workflowStatus;
        this.task = task;
    }

    public WorkflowModel.Status getWorkflowStatus() {
        return workflowStatus;
    }

    public TaskModel getTask() {
        return task;
    }
}
