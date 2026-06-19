import { SearchResult } from '../../../../../../../../../mock';
import { WorkflowSchedule } from '../model/WorkflowSchedule';
import { WorkflowScheduleExecutionModel } from '../model/WorkflowScheduleExecutionModel';
import { SchedulerService } from '../service/SchedulerService';

/**
 * REST API for workflow scheduling.
 *
 * Maps to the public API surface of SchedulerService. All endpoints are relative to
 * /api/scheduler.
 */
export class SchedulerResource {
    private readonly schedulerService: SchedulerService;

    constructor(schedulerService: SchedulerService) {
        this.schedulerService = schedulerService;
    }

    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    public createOrUpdateSchedule(schedule: WorkflowSchedule): WorkflowSchedule {
        return this.schedulerService.createOrUpdateWorkflowSchedule(schedule);
    }

    public getAllSchedules(workflowName?: string): WorkflowSchedule[] {
        if (workflowName !== undefined && workflowName.trim() !== '') {
            return this.schedulerService.getAllSchedules(workflowName);
        }
        return this.schedulerService.getAllSchedules();
    }

    public searchSchedules(
        workflowName?: string,
        scheduleName?: string,
        paused?: boolean,
        freeText: string = '*',
        start: number = 0,
        size: number = 100,
        sort?: string
    ): SearchResult<WorkflowSchedule> {
        let sortOptions: string[] = [];
        if (sort !== undefined && sort.trim() !== '') {
            sortOptions = sort.split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }
        return this.schedulerService.searchSchedules(
            workflowName, scheduleName, paused, freeText, start, size, sortOptions);
    }

    public getSchedule(name: string): WorkflowSchedule {
        return this.schedulerService.getSchedule(name);
    }

    public deleteSchedule(name: string): void {
        this.schedulerService.deleteSchedule(name);
    }

    // -------------------------------------------------------------------------
    // Pause / Resume
    // -------------------------------------------------------------------------

    public pauseSchedule(name: string, reason?: string): void {
        this.schedulerService.pauseSchedule(name, reason);
    }

    public resumeSchedule(name: string): void {
        this.schedulerService.resumeSchedule(name);
    }

    // -------------------------------------------------------------------------
    // Next schedule preview
    // -------------------------------------------------------------------------

    public getNextFewSchedules(
        cronExpression: string,
        scheduleStartTime?: number,
        scheduleEndTime?: number,
        limit: number = 5
    ): number[] {
        return this.schedulerService.getListOfNextSchedules(
            cronExpression, scheduleStartTime, scheduleEndTime, limit);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    public requeueAllExecutionRecords(): Map<string, any> {
        return this.schedulerService.requeueAllExecutionRecords();
    }

    public pauseAllSchedules(): Map<string, any> {
        this.schedulerService.pauseScheduler(true);
        return new Map([["status", "done"]]);
    }

    public resumeAllSchedules(): Map<string, any> {
        this.schedulerService.pauseScheduler(false);
        return new Map([["status", "done"]]);
    }

    // -------------------------------------------------------------------------
    // Execution search
    // -------------------------------------------------------------------------

    public searchScheduledExecutions(
        query?: string,
        freeText: string = '*',
        start: number = 0,
        size: number = 100,
        sort?: string
    ): SearchResult<WorkflowScheduleExecutionModel> {
        let sortOptions: string[] = [];
        if (sort !== undefined && sort.trim() !== '') {
            sortOptions = sort.split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }
        return this.schedulerService.searchScheduledExecutions(
            query, freeText, start, size, sortOptions);
    }
}
