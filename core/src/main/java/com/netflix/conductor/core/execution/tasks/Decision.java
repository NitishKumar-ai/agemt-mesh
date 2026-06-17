package com.netflix.conductor.core.execution.tasks;

import org.springframework.stereotype.Component;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_DECISION;

/**
 * @deprecated {@link Decision} is deprecated. Use {@link Switch} task for condition evaluation
 *     using the extensible evaluation framework. Also see ${@link
 *     com.netflix.conductor.common.metadata.workflow.WorkflowTask}).
 */
@Deprecated
@Component(TASK_TYPE_DECISION)
public class Decision extends WorkflowSystemTask {

    public Decision() {
        super(TASK_TYPE_DECISION);
    }

    @Override
    public boolean execute(
            WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        task.setStatus(TaskModel.Status.COMPLETED);
        return true;
    }
}
