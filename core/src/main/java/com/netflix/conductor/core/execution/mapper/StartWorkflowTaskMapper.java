package com.netflix.conductor.core.execution.mapper;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.model.TaskModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.START_WORKFLOW;
import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_START_WORKFLOW;

@Component
public class StartWorkflowTaskMapper implements TaskMapper {

    private static final Logger LOGGER = LoggerFactory.getLogger(StartWorkflowTaskMapper.class);

    @Override
    public String getTaskType() {
        return START_WORKFLOW.name();
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext)
            throws TerminateWorkflowException {
        WorkflowTask workflowTask = taskMapperContext.getWorkflowTask();

        TaskModel startWorkflowTask = taskMapperContext.createTaskModel();
        startWorkflowTask.setTaskType(TASK_TYPE_START_WORKFLOW);
        startWorkflowTask.addInput(taskMapperContext.getTaskInput());
        startWorkflowTask.setStatus(TaskModel.Status.SCHEDULED);
        startWorkflowTask.setCallbackAfterSeconds(workflowTask.getStartDelay());
        LOGGER.debug("{} created", startWorkflowTask);
        return List.of(startWorkflowTask);
    }
}
