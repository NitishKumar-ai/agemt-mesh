package org.conductoross.conductor.ai.mapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.conductoross.conductor.ai.tasks.mapper.GenEmbeddingsTaskMapper;
import org.junit.jupiter.api.Test;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.core.execution.mapper.TaskMapperContext;
import com.netflix.conductor.core.utils.IDGenerator;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.LLM_PROVIDER;
import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.MODEL_NAME;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class GenEmbeddingsTaskMapperTest {

    @Test
    public void testTaskMapperValidations() {
        // Given
        String taskType = "LLM_GENERATE_EMBEDDINGS";
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setName("gen_embeddings_task");
        workflowTask.setType(taskType);
        String provider = "azure_openai";
        String model = "gpt-3";
        String taskId = new IDGenerator().generate();

        WorkflowModel workflow = new WorkflowModel();
        WorkflowDef workflowDef = new WorkflowDef();
        workflow.setWorkflowDefinition(workflowDef);

        TaskMapperContext taskMapperContext =
                getTaskMapperContext(workflow, workflowTask, taskId, null);

        GenEmbeddingsTaskMapper genEmbeddingsTaskMapper = new GenEmbeddingsTaskMapper();
        // Without any input parameters
        try {
            genEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No provider provided. Please provide it using 'llmProvider' input parameter",
                    e.getMessage());
        }
        // We add 'llmProvider' input parameter
        Map<String, Object> taskInputs = new HashMap<>();
        taskInputs.put(LLM_PROVIDER, provider);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            genEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No model name provided. Please provide it using 'model' input parameter",
                    e.getMessage());
        }

        // We add 'model' input parameter
        taskInputs.put(MODEL_NAME, model);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            genEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "User anonymous does not have access to the Integration "
                            + provider
                            + ":"
                            + model,
                    e.getMessage());
        }

        // Now we use the mocked OrkesPermissionEvaluator
        genEmbeddingsTaskMapper = new GenEmbeddingsTaskMapper();

        List<TaskModel> mappedTasks = genEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        assertEquals(1, mappedTasks.size());
        assertEquals(taskType, mappedTasks.get(0).getTaskType());
        assertEquals(TaskModel.Status.SCHEDULED, mappedTasks.get(0).getStatus());
    }

    protected TaskMapperContext getTaskMapperContext(
            WorkflowModel workflowModel,
            WorkflowTask workflowTask,
            String taskId,
            Map<String, Object> inputs) {
        return TaskMapperContext.newBuilder()
                .withWorkflowModel(workflowModel)
                .withTaskDefinition(new TaskDef())
                .withWorkflowTask(workflowTask)
                .withTaskInput(inputs != null ? inputs : new HashMap<>())
                .withRetryCount(0)
                .withTaskId(taskId)
                .build();
    }
}
