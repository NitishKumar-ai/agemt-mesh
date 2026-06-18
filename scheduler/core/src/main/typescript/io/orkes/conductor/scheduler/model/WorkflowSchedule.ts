import { CronSchedule } from './CronSchedule';

export class WorkflowSchedule {
    name?: string;
    cronExpression?: string;
    runCatchupScheduleInstances?: boolean;
    paused?: boolean;
    pausedReason?: string;
    startWorkflowRequest?: any;
    zoneId: string = 'UTC';
    private _cronSchedules: CronSchedule[] = [];

    get cronSchedules(): CronSchedule[] {
        return this._cronSchedules;
    }

    set cronSchedules(cronSchedules: CronSchedule[]) {
        if (!cronSchedules) {
            this._cronSchedules = [];
        } else {
            this._cronSchedules = [...cronSchedules];
        }
    }

    scheduleStartTime?: number;
    scheduleEndTime?: number;

    createTime?: number;
    updatedTime?: number;
    createdBy?: string;
    updatedBy?: string;
    description?: string;
    nextRunTime?: number;

    getEffectiveCronSchedules(): CronSchedule[] {
        if (this._cronSchedules && this._cronSchedules.length > 0) {
            return this._cronSchedules;
        }
        if (this.cronExpression) {
            const schedule = new CronSchedule();
            schedule.cronExpression = this.cronExpression;
            schedule.zoneId = this.zoneId != null ? this.zoneId : 'UTC';
            return [schedule];
        }
        return [];
    }

    hasMultipleCronSchedules(): boolean {
        return this._cronSchedules != null && this._cronSchedules.length > 0;
    }
}
