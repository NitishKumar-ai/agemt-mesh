package io.conductor.e2e.metadata;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.netflix.conductor.client.http.MetadataClient;
import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;

import io.conductor.e2e.util.ApiUtil;
import io.conductor.e2e.util.Commons;
import io.conductor.e2e.util.WorkflowUtil;

import static org.junit.jupiter.api.Assertions.*;

public class MetadataClientTests {
    private final MetadataClient metadataClient = ApiUtil.METADATA_CLIENT;

    @Test
    void testTaskDefinition() {
        try {
            metadataClient.unregisterTaskDef(Commons.TASK_NAME);
        } catch (Exception ignored) {
            // server returns 500 (not 404) for non-existent resources
        }
        TaskDef taskDef = Commons.getTaskDef();
        metadataClient.registerTaskDefs(List.of(taskDef));
        metadataClient.updateTaskDef(taskDef);
        TaskDef receivedTaskDef = metadataClient.getTaskDef(Commons.TASK_NAME);
        assertTrue(taskDef.getName().equals(receivedTaskDef.getName()));
    }

    @Test
    void testWorkflow() {
        try {
            metadataClient.unregisterWorkflowDef(Commons.WORKFLOW_NAME, Commons.WORKFLOW_VERSION);
        } catch (Exception ignored) {
            // server returns 500 (not 404) for non-existent resources
        }
        metadataClient.registerTaskDefs(List.of(Commons.getTaskDef()));
        WorkflowDef workflowDef = WorkflowUtil.getWorkflowDef();
        metadataClient.updateWorkflowDefs(List.of(workflowDef));
        metadataClient.updateWorkflowDefs(List.of(workflowDef));
        WorkflowDef receivedWorkflowDef =
                metadataClient.getWorkflowDef(Commons.WORKFLOW_NAME, Commons.WORKFLOW_VERSION);
        assertTrue(receivedWorkflowDef.getName().equals(Commons.WORKFLOW_NAME));
        assertEquals(receivedWorkflowDef.getVersion(), Commons.WORKFLOW_VERSION);
    }
}
