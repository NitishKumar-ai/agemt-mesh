package com.netflix.conductor.core.execution.tasks;

import java.util.Optional;

import org.junit.Test;

import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.config.ConductorProperties;
import com.netflix.conductor.model.TaskModel;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class JoinTest {

    private static TaskModel taskWithJoinMode(WorkflowTask.JoinMode mode) {
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setJoinMode(mode);
        TaskModel task = new TaskModel();
        task.setWorkflowTask(workflowTask);
        return task;
    }

    @Test
    public void testSynchronousJoinModeEvaluationOffset() {
        ConductorProperties properties = mock(ConductorProperties.class);
        when(properties.getSystemTaskPostponeThreshold()).thenReturn(200);

        Join join = new Join(properties);
        TaskModel task = taskWithJoinMode(WorkflowTask.JoinMode.SYNC);

        // Synchronous mode should always return 0 offset
        task.setPollCount(100);
        Optional<Long> offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertEquals(0L, offset.get().longValue());

        // Even with high poll count, SYNC mode returns 0
        task.setPollCount(500);
        offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertEquals(0L, offset.get().longValue());
    }

    @Test
    public void testAsynchronousJoinModeEvaluationOffset() {
        ConductorProperties properties = mock(ConductorProperties.class);
        when(properties.getSystemTaskPostponeThreshold()).thenReturn(200);

        Join join = new Join(properties);
        TaskModel task = taskWithJoinMode(WorkflowTask.JoinMode.ASYNC);

        // Low poll count should return 0
        task.setPollCount(100);
        Optional<Long> offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertEquals(0L, offset.get().longValue());

        // High poll count should use exponential backoff
        task.setPollCount(250);
        offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertTrue(offset.get() > 0L);
    }

    @Test
    public void testDefaultAsyncBehavior() {
        ConductorProperties properties = mock(ConductorProperties.class);
        when(properties.getSystemTaskPostponeThreshold()).thenReturn(200);

        Join join = new Join(properties);

        // No joinMode on workflowTask — should default to async behavior
        TaskModel task = new TaskModel();
        task.setWorkflowTask(new WorkflowTask());

        // Low poll count should return 0
        task.setPollCount(100);
        Optional<Long> offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertEquals(0L, offset.get().longValue());

        // High poll count should use exponential backoff (default async behavior)
        task.setPollCount(250);
        offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertTrue(offset.get() > 0L);
    }

    @Test
    public void testNullWorkflowTaskDefaultsToAsync() {
        ConductorProperties properties = mock(ConductorProperties.class);
        when(properties.getSystemTaskPostponeThreshold()).thenReturn(200);

        Join join = new Join(properties);

        // No workflowTask at all — should default to async behavior
        TaskModel task = new TaskModel();

        task.setPollCount(250);
        Optional<Long> offset = join.getEvaluationOffset(task, 10000L);
        assertTrue(offset.isPresent());
        assertTrue(offset.get() > 0L);
    }

    @Test
    public void testIsAsync() {
        ConductorProperties properties = mock(ConductorProperties.class);
        Join join = new Join(properties);

        // isAsync should always return true
        assertTrue(join.isAsync());
    }
}
