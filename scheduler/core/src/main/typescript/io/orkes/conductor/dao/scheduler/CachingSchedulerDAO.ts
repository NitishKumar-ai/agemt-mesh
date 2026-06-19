import { SchedulerDAO } from './SchedulerDAO';
import { SchedulerCacheDAO } from './SchedulerCacheDAO';
import { WorkflowScheduleExecutionModel } from '../../scheduler/model/WorkflowScheduleExecutionModel';
import { WorkflowScheduleModel } from '../../scheduler/model/WorkflowScheduleModel';
import { SearchResult } from '../../../../../../../../../mock';

/**
 * Decorating SchedulerDAO that layers a SchedulerCacheDAO on top of a delegate DAO.
 * Follows the same integration pattern as Orkes Conductor:
 *
 * - updateSchedule — write-through (cache + DB)
 * - findScheduleByName — read cache first, fall back to DB on miss
 * - deleteWorkflowSchedule — invalidate cache, then delete from DB
 * - getNextRunTimeInEpoch — cache only (DB fallback when no cache)
 * - setNextRunTimeInEpoch — cache only (DB fallback when no cache)
 *
 * All other methods (execution records, bulk queries, search) delegate directly.
 */
export class CachingSchedulerDAO implements SchedulerDAO {
    private readonly delegate: SchedulerDAO;
    private readonly cache: SchedulerCacheDAO;

    constructor(delegate: SchedulerDAO, cache: SchedulerCacheDAO) {
        this.delegate = delegate;
        this.cache = cache;
    }

    public updateSchedule(workflowSchedule: WorkflowScheduleModel): void {
        this.cache.updateSchedule(workflowSchedule);
        this.delegate.updateSchedule(workflowSchedule);
    }

    public findScheduleByName(name: string): WorkflowScheduleModel | null {
        const cached = this.cache.findScheduleByName(name);
        if (cached !== null && cached !== undefined) {
            return cached;
        }
        return this.delegate.findScheduleByName(name);
    }

    public deleteWorkflowSchedule(name: string): void {
        this.cache.deleteWorkflowSchedule(name);
        this.delegate.deleteWorkflowSchedule(name);
    }

    public getNextRunTimeInEpoch(scheduleName: string): number {
        return this.cache.getNextRunTimeInEpoch(scheduleName);
    }

    public setNextRunTimeInEpoch(name: string, toEpochMilli: number): void {
        this.cache.setNextRunTimeInEpoch(name, toEpochMilli);
    }

    // -- Pure delegation (no caching) -----------------------------------------

    public saveExecutionRecord(executionModel: WorkflowScheduleExecutionModel): void {
        this.delegate.saveExecutionRecord(executionModel);
    }

    public readExecutionRecord(executionId: string): WorkflowScheduleExecutionModel | null {
        return this.delegate.readExecutionRecord(executionId);
    }

    public removeExecutionRecord(executionId: string): void {
        this.delegate.removeExecutionRecord(executionId);
    }

    public findAllSchedules(workflowName: string): WorkflowScheduleModel[] {
        return this.delegate.findAllSchedules(workflowName);
    }

    public getPendingExecutionRecordIds(): string[] {
        return this.delegate.getPendingExecutionRecordIds();
    }

    public getAllSchedules(): WorkflowScheduleModel[] {
        return this.delegate.getAllSchedules();
    }

    public findAllByNames(workflowScheduleNames: Set<string>): Map<string, WorkflowScheduleModel> {
        return this.delegate.findAllByNames(workflowScheduleNames);
    }

    public searchSchedules(
        workflowName: string,
        scheduleName: string,
        paused: boolean,
        freeText: string,
        start: number,
        size: number,
        sortOptions: string[]
    ): SearchResult<WorkflowScheduleModel> {
        return this.delegate.searchSchedules(
            workflowName,
            scheduleName,
            paused,
            freeText,
            start,
            size,
            sortOptions
        );
    }
}
