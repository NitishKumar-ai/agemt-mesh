export class SchedulerProperties {
    public pollingThreadCount: number = 1;
    public archivalThreadCount: number = 2;
    public schedulerTimeZone: string = "UTC";

    public pollingInterval: number = 100;
    public pollBatchSize: number = 5;
    public archivalPollBatchSize: number = 5;

    public archivalMaintenanceIntervalRecordCount: number = 5000;
    public archivalMaintenanceLockSeconds: number = 600;
    public archivalMaintenanceLockTrySeconds: number = 1;
    public archivalMaxRecords: number = 5;
    public archivalMaxRecordThreshold: number = 10;
    public maxScheduleJitterMs: number = 1000;
    public initialDelayMs: number = 15000;

    public userCacheExpireAfterWriteSeconds: number = 120;
    public userCacheMaxSize: number = 1000;

    /** When true, the scheduler uses an external SchedulerCacheDAO for hot-path lookups. */
    public cacheEnabled: boolean = false;
}
