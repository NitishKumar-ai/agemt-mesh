import { SchedulerCacheDAO } from './SchedulerCacheDAO';
import { WorkflowScheduleModel } from '../../scheduler/model/WorkflowScheduleModel';

/**
 * No-op implementation of SchedulerCacheDAO that always reports a cache miss. Used as the
 * default when no external cache (e.g. Redis) is configured.
 */
export class NoOpSchedulerCacheDAO implements SchedulerCacheDAO {

    public updateSchedule(workflowSchedule: WorkflowScheduleModel): void {}

    public findScheduleByName(name: string): WorkflowScheduleModel | null {
        return null;
    }

    public exists(name: string): boolean {
        return false;
    }

    public deleteWorkflowSchedule(name: string): void {}

    public getNextRunTimeInEpoch(scheduleName: string): number {
        return -1;
    }

    public setNextRunTimeInEpoch(scheduleName: string, epochMilli: number): void {}
}
