package io.orkes.conductor.scheduler.service;

import java.util.List;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;

import com.netflix.conductor.annotations.Audit;
import com.netflix.conductor.annotations.Trace;
import com.netflix.conductor.common.model.BulkResponse;

import io.orkes.conductor.scheduler.config.SchedulerConditions;
import lombok.extern.slf4j.Slf4j;

@Audit
@Trace
@Service
@Slf4j
@Conditional(SchedulerConditions.class)
public class SchedulerBulkServiceImpl implements SchedulerBulkService {

    private final SchedulerService schedulerService;

    public SchedulerBulkServiceImpl(SchedulerService schedulerService) {
        this.schedulerService = schedulerService;
    }

    /**
     * Pause the list of schedules.
     *
     * @param scheduleNames - list of schedule names to perform pause operation on
     * @return bulk response object containing a list of succeeded schedules and a list of failed
     *     ones with errors
     */
    @Override
    public BulkResponse pauseSchedules(List<String> scheduleNames) {
        BulkResponse bulkResponse = new BulkResponse();

        for (String scheduleName : scheduleNames) {
            try {
                schedulerService.pauseSchedule(scheduleName);
                bulkResponse.appendSuccessResponse(scheduleName);
                log.debug("Successfully paused schedule: {}", scheduleName);
            } catch (Exception e) {
                log.error(
                        "bulk pauseSchedule exception, scheduleName {}, message: {}",
                        scheduleName,
                        e.getMessage(),
                        e);
                bulkResponse.appendFailedResponse(scheduleName, e.getMessage());
            }
        }

        log.info(
                "Bulk pause schedules completed. Success: {}, Failed: {}",
                bulkResponse.getBulkSuccessfulResults().size(),
                bulkResponse.getBulkErrorResults().size());

        return bulkResponse;
    }

    /**
     * Resume the list of schedules.
     *
     * @param scheduleNames - list of schedule names to perform resume operation on
     * @return bulk response object containing a list of succeeded schedules and a list of failed
     *     ones with errors
     */
    @Override
    public BulkResponse resumeSchedules(List<String> scheduleNames) {
        BulkResponse bulkResponse = new BulkResponse();

        for (String scheduleName : scheduleNames) {
            try {
                schedulerService.resumeSchedule(scheduleName);
                bulkResponse.appendSuccessResponse(scheduleName);
                log.debug("Successfully resumed schedule: {}", scheduleName);
            } catch (Exception e) {
                log.error(
                        "bulk resumeSchedule exception, scheduleName {}, message: {}",
                        scheduleName,
                        e.getMessage(),
                        e);
                bulkResponse.appendFailedResponse(scheduleName, e.getMessage());
            }
        }

        log.info(
                "Bulk resume schedules completed. Success: {}, Failed: {}",
                bulkResponse.getBulkSuccessfulResults().size(),
                bulkResponse.getBulkErrorResults().size());

        return bulkResponse;
    }
}
