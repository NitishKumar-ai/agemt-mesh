package io.conductor.e2e.util;

import java.util.UUID;

import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.StartWorkflowRequest;

public class Commons {
    public static String WORKFLOW_NAME = "test_wf_" + UUID.randomUUID().toString().replace("-", "");
    public static String TASK_NAME = "test-sdk-java-task";
    public static String OWNER_EMAIL = "test@conductor.io";
    public static int WORKFLOW_VERSION = 1;

    public static TaskDef getTaskDef() {
        TaskDef taskDef = new TaskDef();
        taskDef.setName(Commons.TASK_NAME);
        taskDef.setOwnerEmail(Commons.OWNER_EMAIL);
        return taskDef;
    }

    public static StartWorkflowRequest getStartWorkflowRequest() {
        return new StartWorkflowRequest().withName(WORKFLOW_NAME).withVersion(WORKFLOW_VERSION);
    }
}
