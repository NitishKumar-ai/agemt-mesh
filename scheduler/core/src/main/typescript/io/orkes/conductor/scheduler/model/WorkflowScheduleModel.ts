import { WorkflowSchedule } from './WorkflowSchedule';

export class WorkflowScheduleModel extends WorkflowSchedule {
    static from(schedule: WorkflowSchedule): WorkflowScheduleModel {
        const model = new WorkflowScheduleModel();
        Object.assign(model, schedule);
        return model;
    }

    getQueueMsgId(): string | undefined {
        return this.name;
    }
}
