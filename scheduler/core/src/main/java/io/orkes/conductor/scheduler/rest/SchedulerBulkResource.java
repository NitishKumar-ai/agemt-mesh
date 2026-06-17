package io.orkes.conductor.scheduler.rest;

import java.util.List;

import org.springframework.context.annotation.Conditional;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.netflix.conductor.common.model.BulkResponse;

import io.orkes.conductor.scheduler.config.SchedulerConditions;
import io.orkes.conductor.scheduler.service.SchedulerBulkService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * Bulk APIs to pause and resume schedules in batches.
 *
 * <p>All endpoints are relative to {@code /api/scheduler/bulk}.
 */
@RestController
@Conditional(SchedulerConditions.class)
@RequestMapping("/api/scheduler/bulk")
@Tag(name = "Scheduler Bulk", description = "Bulk scheduler operations")
public class SchedulerBulkResource {

    private final SchedulerBulkService schedulerBulkService;

    public SchedulerBulkResource(SchedulerBulkService schedulerBulkService) {
        this.schedulerBulkService = schedulerBulkService;
    }

    @PutMapping(value = "/pause", produces = APPLICATION_JSON_VALUE)
    @Operation(summary = "Pause the list of schedules")
    public BulkResponse pauseSchedules(@RequestBody List<String> scheduleNames) {
        return schedulerBulkService.pauseSchedules(scheduleNames);
    }

    @PutMapping(value = "/resume", produces = APPLICATION_JSON_VALUE)
    @Operation(summary = "Resume the list of schedules")
    public BulkResponse resumeSchedules(@RequestBody List<String> scheduleNames) {
        return schedulerBulkService.resumeSchedules(scheduleNames);
    }
}
