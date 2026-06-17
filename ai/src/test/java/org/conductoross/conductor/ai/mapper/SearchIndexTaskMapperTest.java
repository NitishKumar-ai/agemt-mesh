package org.conductoross.conductor.ai.mapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.conductoross.conductor.ai.tasks.mapper.SearchIndexTaskMapper;
import org.junit.jupiter.api.Test;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.core.execution.mapper.TaskMapperContext;
import com.netflix.conductor.core.utils.IDGenerator;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.INDEX;
import static org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper.VECTOR_DB;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class SearchIndexTaskMapperTest {

    @Test
    public void testTaskMapperValidations() {
        // Given
        String taskType = "LLM_SEARCH_INDEX";
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setName("search_index_task");
        workflowTask.setType(taskType);
        String provider = "azure_openai";
        String model = "text-embedding-ada-002";
        String vectorDb = "pineconedb";
        String index = "some-index";
        String taskId = new IDGenerator().generate();

        WorkflowModel workflow = new WorkflowModel();
        WorkflowDef workflowDef = new WorkflowDef();
        workflow.setWorkflowDefinition(workflowDef);

        TaskMapperContext taskMapperContext =
                getTaskMapperContext(workflow, workflowTask, taskId, null);

        SearchIndexTaskMapper searchIndexTaskMapper = new SearchIndexTaskMapper();
        // Without any input parameters
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No provider provided. Please provide it using 'embeddingModelProvider' input parameter",
                    e.getMessage());
        }
        // We add 'llmProvider' input parameter
        Map<String, Object> taskInputs = new HashMap<>();
        taskInputs.put("embeddingModelProvider", provider);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No model name provided. Please provide it using 'embeddingModel' input parameter",
                    e.getMessage());
        }

        // We add 'embeddingModel' input parameter
        taskInputs.put("embeddingModel", model);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "User anonymous does not have access to the Integration "
                            + provider
                            + ":"
                            + model,
                    e.getMessage());
        }

        // Now we use a partially mocked OrkesPermissionEvaluator
        searchIndexTaskMapper = new SearchIndexTaskMapper();
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No Vector database provided. Please provide it using 'vectorDB' input parameter",
                    e.getMessage());
        }

        // We add 'vectorDB' input parameter
        taskInputs.put(VECTOR_DB, vectorDb);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "No index provided. Please provide it using 'index' input parameter",
                    e.getMessage());
        }

        // We add 'index' input parameter
        taskInputs.put(INDEX, index);
        taskMapperContext = getTaskMapperContext(workflow, workflowTask, taskId, taskInputs);
        try {
            searchIndexTaskMapper.getMappedTasks(taskMapperContext);
        } catch (TerminateWorkflowException e) {
            assertEquals(
                    "User anonymous does not have access to the index "
                            + index
                            + " from database "
                            + vectorDb,
                    e.getMessage());
        }

        // Finally we use the totally mocked OrkesPermissionEvaluator
        searchIndexTaskMapper = new SearchIndexTaskMapper();

        List<TaskModel> mappedTasks = searchIndexTaskMapper.getMappedTasks(taskMapperContext);
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
