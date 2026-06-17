package com.netflix.conductor.core.execution;

import com.netflix.conductor.core.execution.tasks.WorkflowSystemTask;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

public class WorkflowSystemTaskStub extends WorkflowSystemTask {

    private boolean started = false;

    public WorkflowSystemTaskStub(String taskType) {
        super(taskType);
    }

    @Override
    public void start(WorkflowModel workflow, TaskModel task, WorkflowExecutor executor) {
        started = true;
        task.setStatus(TaskModel.Status.COMPLETED);
        super.start(workflow, task, executor);
    }

    public boolean isStarted() {
        return started;
    }
}
