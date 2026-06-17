package com.netflix.conductor.core.execution.mapper;

import java.util.List;

import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.model.TaskModel;

public interface TaskMapper {

    String getTaskType();

    List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext)
            throws TerminateWorkflowException;
}
