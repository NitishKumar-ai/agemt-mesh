export class NextScheduleResult {
    constructor(
        public readonly nextRunTime: Date | null,
        public readonly zoneId: string
    ) {}

    static of(nextRunTime: Date | null, zoneId: string): NextScheduleResult {
        return new NextScheduleResult(nextRunTime, zoneId);
    }

    hasNextRunTime(): boolean {
        return this.nextRunTime != null;
    }
}
