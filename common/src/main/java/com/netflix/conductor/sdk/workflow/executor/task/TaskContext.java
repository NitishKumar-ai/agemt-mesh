package com.netflix.conductor.sdk.workflow.executor.task;

import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.metadata.tasks.TaskResult;

/**
 * Context that holds the current Task being executed. This allows annotated methods to access the
 * Task object and its properties.
 */
public class TaskContext {

    public static final ThreadLocal<TaskContext> TASK_CONTEXT_INHERITABLE_THREAD_LOCAL =
            InheritableThreadLocal.withInitial(() -> null);

    public TaskContext(Task task, TaskResult taskResult) {
        this.task = task;
        this.taskResult = taskResult;
    }

    public static TaskContext get() {
        return TASK_CONTEXT_INHERITABLE_THREAD_LOCAL.get();
    }

    public static TaskContext set(Task task) {
        TaskResult result = new TaskResult(task);
        TaskContext context = new TaskContext(task, result);
        TASK_CONTEXT_INHERITABLE_THREAD_LOCAL.set(context);
        return context;
    }

    private final Task task;

    private final TaskResult taskResult;

    public String getWorkflowInstanceId() {
        return task.getWorkflowInstanceId();
    }

    public String getTaskId() {
        return task.getTaskId();
    }

    public int getRetryCount() {
        return task.getRetryCount();
    }

    public int getPollCount() {
        return task.getPollCount();
    }

    public long getCallbackAfterSeconds() {
        return task.getCallbackAfterSeconds();
    }

    public void addLog(String log) {
        this.taskResult.log(log);
    }

    public Task getTask() {
        return task;
    }

    public TaskResult getTaskResult() {
        return taskResult;
    }

    public void setCallbackAfter(int seconds) {
        this.taskResult.setCallbackAfterSeconds(seconds);
    }

    public static void clear() {
        TASK_CONTEXT_INHERITABLE_THREAD_LOCAL.remove();
    }
}
