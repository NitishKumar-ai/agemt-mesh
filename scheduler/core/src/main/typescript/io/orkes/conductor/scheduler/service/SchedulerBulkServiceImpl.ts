import { SchedulerBulkService } from './SchedulerBulkService';
import { SchedulerService } from './SchedulerService';
import { BulkResponse } from '../../../../../../../../../mock';

export class SchedulerBulkServiceImpl implements SchedulerBulkService {
    private readonly schedulerService: SchedulerService;
    private static readonly log = console;

    constructor(schedulerService: SchedulerService) {
        this.schedulerService = schedulerService;
    }

    /**
     * Pause the list of schedules.
     *
     * @param scheduleNames - list of schedule names to perform pause operation on
     * @return bulk response object containing a list of succeeded schedules and a list of failed
     *     ones with errors
     */
    public pauseSchedules(scheduleNames: string[]): BulkResponse {
        const bulkResponse = new BulkResponse();

        for (const scheduleName of scheduleNames) {
            try {
                this.schedulerService.pauseSchedule(scheduleName);
                bulkResponse.appendSuccessResponse(scheduleName);
                SchedulerBulkServiceImpl.log.debug(`Successfully paused schedule: ${scheduleName}`);
            } catch (e: any) {
                SchedulerBulkServiceImpl.log.error(
                    `bulk pauseSchedule exception, scheduleName ${scheduleName}, message: ${e.message}`,
                    e
                );
                bulkResponse.appendFailedResponse(scheduleName, e.message);
            }
        }

        SchedulerBulkServiceImpl.log.info(
            `Bulk pause schedules completed. Success: ${bulkResponse.getBulkSuccessfulResults().length}, Failed: ${bulkResponse.getBulkErrorResults().length}`
        );

        return bulkResponse;
    }

    /**
     * Resume the list of schedules.
     *
     * @param scheduleNames - list of schedule names to perform resume operation on
     * @return bulk response object containing a list of succeeded schedules and a list of failed
     *     ones with errors
     */
    public resumeSchedules(scheduleNames: string[]): BulkResponse {
        const bulkResponse = new BulkResponse();

        for (const scheduleName of scheduleNames) {
            try {
                this.schedulerService.resumeSchedule(scheduleName);
                bulkResponse.appendSuccessResponse(scheduleName);
                SchedulerBulkServiceImpl.log.debug(`Successfully resumed schedule: ${scheduleName}`);
            } catch (e: any) {
                SchedulerBulkServiceImpl.log.error(
                    `bulk resumeSchedule exception, scheduleName ${scheduleName}, message: ${e.message}`,
                    e
                );
                bulkResponse.appendFailedResponse(scheduleName, e.message);
            }
        }

        SchedulerBulkServiceImpl.log.info(
            `Bulk resume schedules completed. Success: ${bulkResponse.getBulkSuccessfulResults().length}, Failed: ${bulkResponse.getBulkErrorResults().length}`
        );

        return bulkResponse;
    }
}
