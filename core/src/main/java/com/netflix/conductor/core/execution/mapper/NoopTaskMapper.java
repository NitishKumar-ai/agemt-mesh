package com.netflix.conductor.core.execution.mapper;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.model.TaskModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.*;

@Component
public class NoopTaskMapper implements TaskMapper {

    public static final Logger logger = LoggerFactory.getLogger(NoopTaskMapper.class);

    @Override
    public String getTaskType() {
        return TaskType.NOOP.name();
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext) {
        logger.debug("TaskMapperContext {} in NoopTaskMapper", taskMapperContext);

        TaskModel task = taskMapperContext.createTaskModel();
        task.setTaskType(TASK_TYPE_NOOP);
        task.setStartTime(System.currentTimeMillis());
        task.setStatus(TaskModel.Status.IN_PROGRESS);
        return List.of(task);
    }
}
