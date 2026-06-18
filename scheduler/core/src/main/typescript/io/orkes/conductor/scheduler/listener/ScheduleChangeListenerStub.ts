import { ScheduleChangeListener } from './ScheduleChangeListener';
import { WorkflowSchedule } from '../model/WorkflowSchedule';

/** Stub listener default implementation. Logs each schedule change at debug level. */
export class ScheduleChangeListenerStub implements ScheduleChangeListener {

    // Using console for logger placeholder
    private static readonly LOGGER = console;

    public onScheduleRegistered(schedule: WorkflowSchedule): void {
        ScheduleChangeListenerStub.LOGGER.debug(`Schedule ${schedule.getName()} registered`);
    }

    public onScheduleUpdated(schedule: WorkflowSchedule): void {
        ScheduleChangeListenerStub.LOGGER.debug(`Schedule ${schedule.getName()} updated`);
    }

    public onScheduleDeleted(name: string): void {
        ScheduleChangeListenerStub.LOGGER.debug(`Schedule ${name} deleted`);
    }

    public onSchedulePaused(schedule: WorkflowSchedule): void {
        ScheduleChangeListenerStub.LOGGER.debug(`Schedule ${schedule.getName()} paused`);
    }

    public onScheduleResumed(schedule: WorkflowSchedule): void {
        ScheduleChangeListenerStub.LOGGER.debug(`Schedule ${schedule.getName()} resumed`);
    }
}
