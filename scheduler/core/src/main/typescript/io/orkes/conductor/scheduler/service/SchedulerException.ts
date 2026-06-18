export class SchedulerException extends Error {
    public readonly scheduleName: string;

    constructor(message: string, scheduleName: string) {
        super(message);
        this.scheduleName = scheduleName;
        this.name = 'SchedulerException';
    }
}
