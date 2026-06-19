import { SearchResult } from 'com/netflix/conductor/common/run/SearchResult';
import { WorkflowScheduleExecutionModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { WorkflowScheduleModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleModel';

export interface SchedulerDAO {
    updateSchedule(workflowSchedule: WorkflowScheduleModel): void;

    saveExecutionRecord(executionModel: WorkflowScheduleExecutionModel): void;

    readExecutionRecord(executionId: string): WorkflowScheduleExecutionModel | null;

    removeExecutionRecord(executionId: string): void;

    findScheduleByName(name: string): WorkflowScheduleModel | null;

    findAllSchedules(workflowName: string): Array<WorkflowScheduleModel>;

    deleteWorkflowSchedule(name: string): void;

    getPendingExecutionRecordIds(): Array<string>;

    getAllSchedules(): Array<WorkflowScheduleModel>;

    findAllByNames(workflowScheduleNames: Set<string>): Map<string, WorkflowScheduleModel>;

    getNextRunTimeInEpoch(scheduleName: string): number;

    setNextRunTimeInEpoch(name: string, toEpochMilli: number): void;

    searchSchedules(
        workflowName: string | null,
        scheduleName: string | null,
        paused: boolean | null,
        freeText: string | null,
        start: number,
        size: number,
        sortOptions: Array<string> | null
    ): SearchResult<WorkflowScheduleModel>;
}
