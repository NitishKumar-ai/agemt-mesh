package com.netflix.conductor.core.execution.mapper;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.core.utils.ParametersUtils;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_TERMINATE;

@Component
public class TerminateTaskMapper implements TaskMapper {

    public static final Logger logger = LoggerFactory.getLogger(TerminateTaskMapper.class);
    private final ParametersUtils parametersUtils;

    public TerminateTaskMapper(ParametersUtils parametersUtils) {
        this.parametersUtils = parametersUtils;
    }

    @Override
    public String getTaskType() {
        return TaskType.TERMINATE.name();
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext) {

        logger.debug("TaskMapperContext {} in TerminateTaskMapper", taskMapperContext);

        WorkflowModel workflowModel = taskMapperContext.getWorkflowModel();
        String taskId = taskMapperContext.getTaskId();

        Map<String, Object> taskInput =
                parametersUtils.getTaskInputV2(
                        taskMapperContext.getWorkflowTask().getInputParameters(),
                        workflowModel,
                        taskId,
                        null);

        TaskModel task = taskMapperContext.createTaskModel();
        task.setTaskType(TASK_TYPE_TERMINATE);
        task.setStartTime(System.currentTimeMillis());
        task.setInputData(taskInput);
        task.setStatus(TaskModel.Status.IN_PROGRESS);
        return List.of(task);
    }
}
