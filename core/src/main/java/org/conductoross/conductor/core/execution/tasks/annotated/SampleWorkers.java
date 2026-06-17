package org.conductoross.conductor.core.execution.tasks.annotated;

import org.springframework.stereotype.Component;

import com.netflix.conductor.sdk.workflow.executor.task.TaskContext;
import com.netflix.conductor.sdk.workflow.task.InputParam;
import com.netflix.conductor.sdk.workflow.task.WorkerTask;

@Component
public class SampleWorkers {

    @WorkerTask("HELLO")
    public String hello(@InputParam("name") String name) {
        return "Hello %s, from the sample worker, with id: %s"
                .formatted(name, TaskContext.get().getTaskId());
    }
}
