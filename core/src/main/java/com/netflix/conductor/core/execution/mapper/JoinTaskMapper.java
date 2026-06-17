package com.netflix.conductor.core.execution.mapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

/**
 * An implementation of {@link TaskMapper} to map a {@link WorkflowTask} of type {@link
 * TaskType#JOIN} to a {@link TaskModel} of type {@link TaskType#JOIN}
 */
@Component
public class JoinTaskMapper implements TaskMapper {

    public static final Logger LOGGER = LoggerFactory.getLogger(JoinTaskMapper.class);

    @Override
    public String getTaskType() {
        return TaskType.JOIN.name();
    }

    /**
     * This method maps {@link TaskMapper} to map a {@link WorkflowTask} of type {@link
     * TaskType#JOIN} to a {@link TaskModel} of type {@link TaskType#JOIN} with a status of {@link
     * TaskModel.Status#IN_PROGRESS}
     *
     * @param taskMapperContext: A wrapper class containing the {@link WorkflowTask}, {@link
     *     WorkflowDef}, {@link WorkflowModel} and a string representation of the TaskId
     * @return A {@link TaskModel} of type {@link TaskType#JOIN} in a List
     */
    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext) {

        LOGGER.debug("TaskMapperContext {} in JoinTaskMapper", taskMapperContext);

        WorkflowTask workflowTask = taskMapperContext.getWorkflowTask();

        Map<String, Object> joinInput = new HashMap<>();
        joinInput.put("joinOn", workflowTask.getJoinOn());

        TaskModel joinTask = taskMapperContext.createTaskModel();
        joinTask.setTaskType(TaskType.TASK_TYPE_JOIN);
        joinTask.setTaskDefName(TaskType.TASK_TYPE_JOIN);
        joinTask.setStartTime(System.currentTimeMillis());
        joinTask.setInputData(joinInput);
        joinTask.setStatus(TaskModel.Status.IN_PROGRESS);
        if (Objects.nonNull(taskMapperContext.getTaskDefinition())) {
            joinTask.setIsolationGroupId(
                    taskMapperContext.getTaskDefinition().getIsolationGroupId());
        }

        return List.of(joinTask);
    }
}
