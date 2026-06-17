package com.netflix.conductor.core.execution.mapper;

import java.util.Arrays;
import java.util.List;

import org.junit.Test;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.utils.IDGenerator;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_JOIN;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class JoinTaskMapperTest {

    @Test
    public void getMappedTasks() {

        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setType(TaskType.JOIN.name());
        workflowTask.setJoinOn(Arrays.asList("task1", "task2"));

        String taskId = new IDGenerator().generate();

        WorkflowDef wd = new WorkflowDef();
        WorkflowModel workflow = new WorkflowModel();
        workflow.setWorkflowDefinition(wd);

        TaskMapperContext taskMapperContext =
                TaskMapperContext.newBuilder()
                        .withWorkflowModel(workflow)
                        .withTaskDefinition(new TaskDef())
                        .withWorkflowTask(workflowTask)
                        .withRetryCount(0)
                        .withTaskId(taskId)
                        .build();

        List<TaskModel> mappedTasks = new JoinTaskMapper().getMappedTasks(taskMapperContext);

        assertNotNull(mappedTasks);
        assertEquals(TASK_TYPE_JOIN, mappedTasks.get(0).getTaskType());
    }

    @Test
    public void getMappedTasksWithJoinMode() {

        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setType(TaskType.JOIN.name());
        workflowTask.setJoinOn(Arrays.asList("task1", "task2"));
        workflowTask.setJoinMode(WorkflowTask.JoinMode.SYNC);

        String taskId = new IDGenerator().generate();

        WorkflowDef wd = new WorkflowDef();
        WorkflowModel workflow = new WorkflowModel();
        workflow.setWorkflowDefinition(wd);

        TaskMapperContext taskMapperContext =
                TaskMapperContext.newBuilder()
                        .withWorkflowModel(workflow)
                        .withTaskDefinition(new TaskDef())
                        .withWorkflowTask(workflowTask)
                        .withRetryCount(0)
                        .withTaskId(taskId)
                        .build();

        List<TaskModel> mappedTasks = new JoinTaskMapper().getMappedTasks(taskMapperContext);

        assertNotNull(mappedTasks);
        assertEquals(TASK_TYPE_JOIN, mappedTasks.get(0).getTaskType());
        // joinMode is read directly from workflowTask, not injected into input data
        assertNull(mappedTasks.get(0).getInputData().get("joinMode"));
        assertEquals(
                WorkflowTask.JoinMode.SYNC, mappedTasks.get(0).getWorkflowTask().getJoinMode());
    }
}
