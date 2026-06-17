package io.conductor.e2e.util;

import com.netflix.conductor.client.worker.Worker;
import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.metadata.tasks.TaskResult;

public class SimpleWorker implements Worker {
    @Override
    public String getTaskDefName() {
        return Commons.TASK_NAME;
    }

    @Override
    public TaskResult execute(Task task) {
        task.setStatus(Task.Status.COMPLETED);
        task.getOutputData().put("key", "value");
        task.getOutputData().put("key2", 42);
        return new TaskResult(task);
    }
}
