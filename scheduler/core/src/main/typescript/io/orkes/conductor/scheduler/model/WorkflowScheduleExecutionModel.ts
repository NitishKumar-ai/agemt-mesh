export enum State {
    POLLED = 'POLLED',
    FAILED = 'FAILED',
    EXECUTED = 'EXECUTED'
}

export class WorkflowScheduleExecutionModel {
    executionId?: string;
    scheduleName?: string;
    scheduledTime?: number;
    executionTime?: number;
    workflowName?: string;
    workflowId?: string;
    reason?: string;
    stackTrace?: string;
    startWorkflowRequest?: any;
    state?: State;
    zoneId: string = 'UTC';

    getQueueMsgId(): string | undefined {
        return this.executionId;
    }
}
