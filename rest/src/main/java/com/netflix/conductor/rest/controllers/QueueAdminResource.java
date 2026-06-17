package com.netflix.conductor.rest.controllers;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.netflix.conductor.core.events.queue.DefaultEventQueueProcessor;
import com.netflix.conductor.model.TaskModel.Status;

import io.swagger.v3.oas.annotations.Operation;

import static com.netflix.conductor.rest.config.RequestMappingConstants.QUEUE;

@RestController
@RequestMapping(QUEUE)
public class QueueAdminResource {

    private final DefaultEventQueueProcessor defaultEventQueueProcessor;

    public QueueAdminResource(DefaultEventQueueProcessor defaultEventQueueProcessor) {
        this.defaultEventQueueProcessor = defaultEventQueueProcessor;
    }

    @Operation(summary = "Get the queue length")
    @GetMapping(value = "/size")
    public Map<String, Long> size() {
        return defaultEventQueueProcessor.size();
    }

    @Operation(summary = "Get Queue Names")
    @GetMapping(value = "/")
    public Map<Status, String> names() {
        return defaultEventQueueProcessor.queues();
    }

    @Operation(summary = "Publish a message in queue to mark a wait task as completed.")
    @PostMapping(value = "/update/{workflowId}/{taskRefName}/{status}")
    public void update(
            @PathVariable("workflowId") String workflowId,
            @PathVariable("taskRefName") String taskRefName,
            @PathVariable("status") Status status,
            @RequestBody Map<String, Object> output)
            throws Exception {
        defaultEventQueueProcessor.updateByTaskRefName(workflowId, taskRefName, output, status);
    }

    @Operation(summary = "Publish a message in queue to mark a wait task (by taskId) as completed.")
    @PostMapping("/update/{workflowId}/task/{taskId}/{status}")
    public void updateByTaskId(
            @PathVariable("workflowId") String workflowId,
            @PathVariable("taskId") String taskId,
            @PathVariable("status") Status status,
            @RequestBody Map<String, Object> output)
            throws Exception {
        defaultEventQueueProcessor.updateByTaskId(workflowId, taskId, output, status);
    }
}
