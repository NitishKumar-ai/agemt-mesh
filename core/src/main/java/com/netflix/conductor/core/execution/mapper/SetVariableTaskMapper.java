package com.netflix.conductor.core.execution.mapper;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.model.TaskModel;

@Component
public class SetVariableTaskMapper implements TaskMapper {

    public static final Logger LOGGER = LoggerFactory.getLogger(SetVariableTaskMapper.class);

    @Override
    public String getTaskType() {
        return TaskType.SET_VARIABLE.name();
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext)
            throws TerminateWorkflowException {
        LOGGER.debug("TaskMapperContext {} in SetVariableMapper", taskMapperContext);

        TaskModel varTask = taskMapperContext.createTaskModel();
        varTask.setStartTime(System.currentTimeMillis());
        varTask.setInputData(taskMapperContext.getTaskInput());
        varTask.setStatus(TaskModel.Status.IN_PROGRESS);

        return List.of(varTask);
    }
}
