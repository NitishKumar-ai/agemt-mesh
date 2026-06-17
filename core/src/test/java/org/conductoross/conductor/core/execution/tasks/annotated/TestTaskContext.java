package org.conductoross.conductor.core.execution.tasks.annotated;

import org.junit.After;
import org.junit.Test;

import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.sdk.workflow.executor.task.TaskContext;

import static org.junit.Assert.*;

public class TestTaskContext {

    @After
    public void cleanup() {
        TaskContext.clear();
    }

    @Test
    public void testThreadLocalBehavior() {
        TaskModel task = new TaskModel();
        task.setTaskId("id-1");
        task.setStatus(TaskModel.Status.SCHEDULED);

        assertNull(TaskContext.get());

        TaskContext context = TaskContext.set(task.toTask());
        assertNotNull(context);
        assertEquals("id-1", context.getTaskId());
        assertSame(context, TaskContext.get());

        TaskContext.clear();
        assertNull(TaskContext.get());
    }

    @Test
    public void testGettersAndSetters() {
        TaskModel task = new TaskModel();
        task.setWorkflowInstanceId("workflow-1");
        task.setTaskId("task-1");
        task.setWorkerId("worker-1");
        task.setRetryCount(3);
        task.setPollCount(5);
        task.setCallbackAfterSeconds(10);
        task.setStatus(TaskModel.Status.SCHEDULED);

        TaskContext.set(task.toTask());
        TaskContext context = TaskContext.get();

        assertEquals("workflow-1", context.getWorkflowInstanceId());
        assertEquals("task-1", context.getTaskId());
        assertEquals(3, context.getRetryCount());
        assertEquals(5, context.getPollCount());
        assertEquals(10, context.getCallbackAfterSeconds());

        context.setCallbackAfter(20);
        assertEquals(20, context.getTaskResult().getCallbackAfterSeconds());
    }
}
