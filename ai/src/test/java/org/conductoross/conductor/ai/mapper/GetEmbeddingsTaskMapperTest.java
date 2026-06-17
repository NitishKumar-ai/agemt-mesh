package org.conductoross.conductor.ai.mapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.conductoross.conductor.ai.tasks.mapper.GetEmbeddingsTaskMapper;
import org.junit.jupiter.api.Test;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.core.execution.mapper.TaskMapperContext;
import com.netflix.conductor.core.utils.IDGenerator;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.EMBEDDINGS;
import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.INDEX;
import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.VECTOR_DB;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class GetEmbeddingsTaskMapperTest {

    @Test
    public void testTaskMapperValidations() {
        // Given
        String taskType = "LLM_GET_EMBEDDINGS";
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setName("get_embeddings_task");
        workflowTask.setType(taskType);
        String vectorDb = "pineconedb";
        String index = "some-index";
        String taskId = new IDGenerator().generate();

        WorkflowModel workflow = new WorkflowModel();
        WorkflowDef workflowDef = new WorkflowDef();
        workflow.setWorkflowDefinition(workflowDef);

        TaskMapperContext taskMapperContext =
                getTaskMapperContext(workflow, workflowTask, taskId, null);

        GetEmbeddingsTaskMapper getEmbeddingsTaskMapper = new GetEmbeddingsTaskMapper();
        // Without any input parameters
        try {
            getEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No Vector database provided. Please provide it using 'vectorDB' input parameter",
                    e.getMessage());
        }
        // We add 'vectorDB' input parameter
        Map<String, Object> taskInputs = new HashMap<>();
        taskInputs.put(VECTOR_DB, vectorDb);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            getEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No index provided. Please provide it using 'index' input parameter",
                    e.getMessage());
        }

        // We add 'index' input parameter
        taskInputs.put(INDEX, index);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            getEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No embeddings provided. Please provide them using 'embeddings' input parameter",
                    e.getMessage());
        }

        // We add 'embeddings' input parameter
        taskInputs.put(EMBEDDINGS, List.of(1.0F));
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            getEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "User anonymous does not have access to the index "
                            + index
                            + " from database "
                            + vectorDb,
                    e.getMessage());
        }

        // Now we use the mocked OrkesPermissionEvaluator
        getEmbeddingsTaskMapper = new GetEmbeddingsTaskMapper();

        List<TaskModel> mappedTasks = getEmbeddingsTaskMapper.getMappedTasks(taskMapperContext);
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
