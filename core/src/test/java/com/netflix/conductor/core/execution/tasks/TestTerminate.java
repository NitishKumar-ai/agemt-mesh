package com.netflix.conductor.core.execution.tasks;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.core.execution.tasks.Terminate.getTerminationStatusParameter;
import static com.netflix.conductor.core.execution.tasks.Terminate.getTerminationWorkflowOutputParameter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;

public class TestTerminate {

    private final WorkflowExecutor executor = mock(WorkflowExecutor.class);

    @Test
    public void should_fail_if_input_status_is_not_valid() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "PAUSED");

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.FAILED, task.getStatus());
    }

    @Test
    public void should_fail_if_input_status_is_empty() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "");

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.FAILED, task.getStatus());
    }

    @Test
    public void should_fail_if_input_status_is_null() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), null);

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.FAILED, task.getStatus());
    }

    @Test
    public void should_complete_workflow_on_terminate_task_success() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();
        workflow.setOutput(Collections.singletonMap("output", "${task1.output.value}"));

        HashMap<String, Object> expectedOutput =
                new HashMap<>() {
                    {
                        put("output", "${task0.output.value}");
                    }
                };

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "COMPLETED");
        input.put(getTerminationWorkflowOutputParameter(), "${task0.output.value}");

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.COMPLETED, task.getStatus());
        assertEquals(expectedOutput, task.getOutputData());
    }

    @Test
    public void should_fail_workflow_on_terminate_task_success() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();
        workflow.setOutput(Collections.singletonMap("output", "${task1.output.value}"));

        HashMap<String, Object> expectedOutput =
                new HashMap<>() {
                    {
                        put("output", "${task0.output.value}");
                    }
                };

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "FAILED");
        input.put(getTerminationWorkflowOutputParameter(), "${task0.output.value}");

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.COMPLETED, task.getStatus());
        assertEquals(expectedOutput, task.getOutputData());
    }

    @Test
    public void should_fail_workflow_on_terminate_task_success_with_empty_output() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "FAILED");

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.COMPLETED, task.getStatus());
        assertTrue(task.getOutputData().isEmpty());
    }

    @Test
    public void should_fail_workflow_on_terminate_task_success_with_resolved_output() {
        WorkflowModel workflow = new WorkflowModel();
        Terminate terminateTask = new Terminate();

        HashMap<String, Object> expectedOutput =
                new HashMap<>() {
                    {
                        put("result", 1);
                    }
                };

        Map<String, Object> input = new HashMap<>();
        input.put(getTerminationStatusParameter(), "FAILED");
        input.put(getTerminationWorkflowOutputParameter(), expectedOutput);

        TaskModel task = new TaskModel();
        task.getInputData().putAll(input);
        terminateTask.execute(workflow, task, executor);
        assertEquals(TaskModel.Status.COMPLETED, task.getStatus());
    }
}
