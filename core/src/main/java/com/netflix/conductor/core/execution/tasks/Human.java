package com.netflix.conductor.core.execution.tasks;

import org.springframework.stereotype.Component;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_HUMAN;
import static com.netflix.conductor.model.TaskModel.Status.IN_PROGRESS;

@Component(TASK_TYPE_HUMAN)
public class Human extends WorkflowSystemTask {

    public Human() {
        super(TASK_TYPE_HUMAN);
    }

    @Override
    public void start(WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        task.setStatus(IN_PROGRESS);
    }

    @Override
    public void cancel(WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        task.setStatus(TaskModel.Status.CANCELED);
    }
}
