package io.orkes.conductor.scheduler.service;

import java.util.List;

import org.springframework.validation.annotation.Validated;

import com.netflix.conductor.common.model.BulkResponse;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

@Validated
public interface SchedulerBulkService {

    int MAX_REQUEST_ITEMS = 1000;

    BulkResponse pauseSchedules(
            @NotEmpty(message = "Schedule names list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} schedules. Please use multiple requests.")
                    List<String> scheduleNames);

    BulkResponse resumeSchedules(
            @NotEmpty(message = "Schedule names list cannot be null.")
                    @Size(
                            max = MAX_REQUEST_ITEMS,
                            message =
                                    "Cannot process more than {max} schedules. Please use multiple requests.")
                    List<String> scheduleNames);
}
