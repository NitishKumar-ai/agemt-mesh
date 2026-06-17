package com.netflix.conductor.core.execution.tasks;

import org.springframework.stereotype.Component;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_SWITCH;

/** {@link Switch} task is a replacement for now deprecated {@link Decision} task. */
@Component(TASK_TYPE_SWITCH)
public class Switch extends WorkflowSystemTask {

    public Switch() {
        super(TASK_TYPE_SWITCH);
    }

    @Override
    public boolean execute(
            WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        task.setStatus(TaskModel.Status.COMPLETED);
        return true;
    }
}
