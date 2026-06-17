package org.conductoross.conductor.model;

import java.util.List;
import java.util.Map;

import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.run.Workflow;

import lombok.Data;

@Data
public class WorkflowRun extends SignalResponse {

    private int priority;
    private Map<String, Object> variables;
    private List<Task> tasks;
    private String createdBy;
    private long createTime;
    private Workflow.WorkflowStatus status;
    private long updateTime;
}
