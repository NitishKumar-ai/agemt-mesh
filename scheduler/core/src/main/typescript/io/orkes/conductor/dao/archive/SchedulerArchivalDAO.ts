import { SearchResult } from 'com/netflix/conductor/common/run/SearchResult';
import { WorkflowScheduleExecutionModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';

export interface SchedulerArchivalDAO {
    saveExecutionRecord(executionModel: WorkflowScheduleExecutionModel): void;

    searchScheduledExecutions(
        query: string,
        freeText: string,
        start: number,
        count: number,
        sort: Array<string>
    ): SearchResult<string>;

    getExecutionsByIds(executionIds: Set<string>): Map<string, WorkflowScheduleExecutionModel>;

    getExecutionById(executionId: string): WorkflowScheduleExecutionModel | null;

    cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): void;
}
