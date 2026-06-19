import { WorkflowScheduleModel } from 'io/orkes/conductor/scheduler/model/WorkflowScheduleModel';

export interface SchedulerCacheDAO {
    updateSchedule(workflowSchedule: WorkflowScheduleModel): void;

    findScheduleByName(name: string): WorkflowScheduleModel | null;

    exists(name: string): boolean;

    deleteWorkflowSchedule(name: string): void;

    getNextRunTimeInEpoch(scheduleName: string): number;

    setNextRunTimeInEpoch(scheduleName: string, epochMilli: number): void;
}
