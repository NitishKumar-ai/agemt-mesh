package org.conductoross.conductor.model;

import java.util.List;
import java.util.Map;

import com.netflix.conductor.common.metadata.tasks.Task;

import lombok.Data;

@Data
public class TaskRun extends SignalResponse {

    private String taskType;
    private String taskId;
    private String referenceTaskName;
    private int retryCount;
    private String taskDefName;
    private String retriedTaskId;
    private String workflowType;
    private String reasonForIncompletion;
    private int priority;
    private Map<String, Object> variables;
    private List<Task> tasks;
    private String createdBy;
    private long createTime;
    private long updateTime;
    private Task.Status status;
}
