package io.orkes.conductor.scheduler.model;

import com.netflix.conductor.common.metadata.workflow.StartWorkflowRequest;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;

@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowScheduleExecutionModel {

    public enum State {
        POLLED,
        FAILED,
        EXECUTED;
    }

    private String executionId;
    private String scheduleName;
    private Long scheduledTime;
    private Long executionTime;
    private String workflowName;
    private String workflowId;
    private String reason;
    private String stackTrace;
    private StartWorkflowRequest startWorkflowRequest;
    private State state;
    private String zoneId = "UTC";

    @JsonIgnore
    public String getQueueMsgId() {
        return executionId;
    }
}
