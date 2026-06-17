package com.netflix.conductor.core.execution.tasks;

import org.junit.Test;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class TestNoop {

    private final WorkflowExecutor executor = mock(WorkflowExecutor.class);

    @Test
    public void should_do_nothing() {
        WorkflowModel workflow = new WorkflowModel();
        Noop noopTask = new Noop();
        TaskModel task = new TaskModel();
        noopTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.COMPLETED, task.getStatus());
    }
}
