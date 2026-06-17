package org.conductoross.conductor.core.execution.mapper;

import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

/** Used for validating tasks */
public interface TaskMapperValidator {

    String getTaskType();

    void validate(WorkflowModel workflow, TaskModel task) throws TerminateWorkflowException;
}
