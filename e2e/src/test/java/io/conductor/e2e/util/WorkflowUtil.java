package io.conductor.e2e.util;

import java.util.List;

import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;

public class WorkflowUtil {
    public static WorkflowDef getWorkflowDef() {
        WorkflowDef workflowDef = new WorkflowDef();
        workflowDef.setName(Commons.WORKFLOW_NAME);
        workflowDef.setVersion(Commons.WORKFLOW_VERSION);
        workflowDef.setOwnerEmail(Commons.OWNER_EMAIL);
        workflowDef.setTimeoutSeconds(600);
        workflowDef.setTimeoutPolicy(WorkflowDef.TimeoutPolicy.TIME_OUT_WF);
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setName(Commons.TASK_NAME);
        workflowTask.setTaskReferenceName(Commons.TASK_NAME);
        workflowDef.setTasks(List.of(workflowTask));
        return workflowDef;
    }
}
