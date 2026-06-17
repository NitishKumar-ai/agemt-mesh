package com.netflix.conductor.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowNotifications {
    private String requestId;
    private String hostIp;
    private String waitUntilTasks;
    private boolean monitorParentOnly = false;

    @Override
    public String toString() {
        return "WorkflowNotifications{"
                + "hostIp='"
                + hostIp
                + '\''
                + ", requestId='"
                + requestId
                + '\''
                + ", waitUntilTasks='"
                + waitUntilTasks
                + '\''
                + '}';
    }
}
