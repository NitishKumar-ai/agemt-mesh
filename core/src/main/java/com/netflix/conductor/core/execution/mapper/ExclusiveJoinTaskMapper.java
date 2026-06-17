package com.netflix.conductor.core.execution.mapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.model.TaskModel;

@Component
public class ExclusiveJoinTaskMapper implements TaskMapper {

    public static final Logger LOGGER = LoggerFactory.getLogger(ExclusiveJoinTaskMapper.class);

    @Override
    public String getTaskType() {
        return TaskType.EXCLUSIVE_JOIN.name();
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext) {

        LOGGER.debug("TaskMapperContext {} in ExclusiveJoinTaskMapper", taskMapperContext);

        WorkflowTask workflowTask = taskMapperContext.getWorkflowTask();

        Map<String, Object> joinInput = new HashMap<>();
        joinInput.put("joinOn", workflowTask.getJoinOn());

        if (workflowTask.getDefaultExclusiveJoinTask() != null) {
            joinInput.put("defaultExclusiveJoinTask", workflowTask.getDefaultExclusiveJoinTask());
        }

        TaskModel joinTask = taskMapperContext.createTaskModel();
        joinTask.setTaskType(TaskType.TASK_TYPE_EXCLUSIVE_JOIN);
        joinTask.setTaskDefName(TaskType.TASK_TYPE_EXCLUSIVE_JOIN);
        joinTask.setStartTime(System.currentTimeMillis());
        joinTask.setInputData(joinInput);
        joinTask.setStatus(TaskModel.Status.IN_PROGRESS);

        return List.of(joinTask);
    }
}
