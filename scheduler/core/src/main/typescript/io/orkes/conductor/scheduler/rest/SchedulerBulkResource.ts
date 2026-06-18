import { BulkResponse } from '../../../../../../../../../mock';
import { SchedulerBulkService } from '../service/SchedulerBulkService';

/**
 * Bulk APIs to pause and resume schedules in batches.
 *
 * All endpoints are relative to /api/scheduler/bulk.
 */
export class SchedulerBulkResource {
    private readonly schedulerBulkService: SchedulerBulkService;

    constructor(schedulerBulkService: SchedulerBulkService) {
        this.schedulerBulkService = schedulerBulkService;
    }

    public pauseSchedules(scheduleNames: string[]): BulkResponse {
        return this.schedulerBulkService.pauseSchedules(scheduleNames);
    }

    public resumeSchedules(scheduleNames: string[]): BulkResponse {
        return this.schedulerBulkService.resumeSchedules(scheduleNames);
    }
}
