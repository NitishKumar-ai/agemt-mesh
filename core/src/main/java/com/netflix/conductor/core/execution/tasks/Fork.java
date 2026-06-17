package com.netflix.conductor.core.execution.tasks;

import org.springframework.stereotype.Component;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_FORK;

@Component(TASK_TYPE_FORK)
public class Fork extends WorkflowSystemTask {

    public Fork() {
        super(TASK_TYPE_FORK);
    }
}
