package com.netflix.conductor.core.execution.mapper;

import java.util.List;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.utils.IDGenerator;
import com.netflix.conductor.core.utils.ParametersUtils;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static org.mockito.Mockito.mock;

public class TerminateTaskMapperTest {
    private ParametersUtils parametersUtils;

    @Before
    public void setUp() {
        parametersUtils = mock(ParametersUtils.class);
    }

    @Test
    public void getMappedTasks() {

        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setType(TaskType.TASK_TYPE_TERMINATE);

        String taskId = new IDGenerator().generate();

        WorkflowDef workflowDef = new WorkflowDef();
        WorkflowModel workflow = new WorkflowModel();
        workflow.setWorkflowDefinition(workflowDef);

        TaskMapperContext taskMapperContext =
                TaskMapperContext.newBuilder()
                        .withWorkflowModel(workflow)
                        .withTaskDefinition(new TaskDef())
                        .withWorkflowTask(workflowTask)
                        .withRetryCount(0)
                        .withTaskId(taskId)
                        .build();

        List<TaskModel> mappedTasks =
                new TerminateTaskMapper(parametersUtils).getMappedTasks(taskMapperContext);

        Assert.assertNotNull(mappedTasks);
        Assert.assertEquals(1, mappedTasks.size());
        Assert.assertEquals(TaskType.TASK_TYPE_TERMINATE, mappedTasks.get(0).getTaskType());
    }
}
