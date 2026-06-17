package org.conductoross.conductor.ai.sql;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.execution.mapper.TaskMapper;
import com.netflix.conductor.core.execution.mapper.TaskMapperContext;
import com.netflix.conductor.model.TaskModel;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class JDBCTaskMapper implements TaskMapper {

    @Override
    public String getTaskType() {
        return JDBCWorker.NAME;
    }

    @Override
    public List<TaskModel> getMappedTasks(TaskMapperContext taskMapperContext) {
        WorkflowTask workflowTask = taskMapperContext.getWorkflowTask();
        int retryCount = taskMapperContext.getRetryCount();
        String retriedTaskId = taskMapperContext.getRetryTaskId();
        TaskDef taskDefinition = workflowTask.getTaskDefinition();
        if (taskDefinition == null) {
            taskDefinition = new TaskDef(workflowTask.getName());
        }

        Map<String, Object> input = taskMapperContext.getTaskInput();

        TaskModel task = taskMapperContext.createTaskModel();
        task.setTaskType(JDBCWorker.NAME);
        task.setStartDelayInSeconds(workflowTask.getStartDelay());
        task.setInputData(input);
        task.setStatus(TaskModel.Status.SCHEDULED);
        task.setRetryCount(retryCount);
        task.setCallbackAfterSeconds(workflowTask.getStartDelay());
        task.setResponseTimeoutSeconds(taskDefinition.getResponseTimeoutSeconds());
        task.setRetriedTaskId(retriedTaskId);
        task.setRateLimitPerFrequency(taskDefinition.getRateLimitPerFrequency());
        task.setRateLimitFrequencyInSeconds(taskDefinition.getRateLimitFrequencyInSeconds());

        return List.of(task);
    }
}
