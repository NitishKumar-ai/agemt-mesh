import { WorkflowSchedule } from 'io/orkes/conductor/scheduler/model/WorkflowSchedule';

export interface ScheduleChangeListener {
    onScheduleRegistered?(schedule: WorkflowSchedule): void;

    onScheduleUpdated?(schedule: WorkflowSchedule): void;

    onScheduleDeleted?(name: string): void;

    onSchedulePaused?(schedule: WorkflowSchedule): void;

    onScheduleResumed?(schedule: WorkflowSchedule): void;
}
