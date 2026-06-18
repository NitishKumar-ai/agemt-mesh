import { SchedulerProperties } from './SchedulerProperties';

export class SchedulerOssConfiguration {
    public noOpSchedulerCacheDAO(): any {
        return {};
    }

    public cachingSchedulerDAO(schedulerDAO: any, schedulerCacheDAO: any): any {
        return {};
    }

    public schedulerService(
        schedulerArchivalDAO: any,
        schedulerDAO: any,
        workflowService: any,
        queueDAO: any,
        schedulerServiceExecutor: any,
        redisMaintenanceDAO: any,
        properties: SchedulerProperties,
        schedulerTimeProvider: any,
        lock: any,
        objectMapper: any,
        scheduleChangeListener: any
    ): any {
        return {};
    }

    public scheduleChangeListener(): any {
        return {};
    }
}
