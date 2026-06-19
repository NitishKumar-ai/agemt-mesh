import { BulkResponse } from 'com/netflix/conductor/common/model/BulkResponse';

export interface SchedulerBulkService {
    pauseSchedules(scheduleNames: Array<string>): BulkResponse;

    resumeSchedules(scheduleNames: Array<string>): BulkResponse;
}

export const MAX_REQUEST_ITEMS = 1000;
