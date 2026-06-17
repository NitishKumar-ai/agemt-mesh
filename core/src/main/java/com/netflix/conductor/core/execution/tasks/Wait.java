package com.netflix.conductor.core.execution.tasks;

import java.time.Duration;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_WAIT;
import static com.netflix.conductor.model.TaskModel.Status.*;

@Component(TASK_TYPE_WAIT)
public class Wait extends WorkflowSystemTask {

    public static final String DURATION_INPUT = "duration";
    public static final String UNTIL_INPUT = "until";

    public Wait() {
        super(TASK_TYPE_WAIT);
    }

    @Override
    public void start(WorkflowModel workflow, TaskModel task, WorkflowExecutor executor) {
        task.setStatus(TaskModel.Status.IN_PROGRESS);
    }

    @Override
    public void cancel(WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        task.setStatus(TaskModel.Status.CANCELED);
    }

    @Override
    public boolean execute(
            WorkflowModel workflow, TaskModel task, WorkflowExecutor workflowExecutor) {
        long timeOut = task.getWaitTimeout();
        if (timeOut == 0) {
            return false;
        }
        if (System.currentTimeMillis() > timeOut) {
            task.setStatus(COMPLETED);
            return true;
        }

        return false;
    }

    @Override
    public Optional<Long> getEvaluationOffset(TaskModel taskModel, long maxOffset) {
        if (taskModel.getWaitTimeout() > 0) {
            long seconds =
                    Duration.ofMillis(taskModel.getWaitTimeout() - System.currentTimeMillis())
                            .getSeconds();
            if (seconds == 0) {
                seconds = 1;
            }
            return Optional.of(seconds);
        }
        return Optional.empty();
    }

    public boolean isAsync() {
        return true;
    }
}
