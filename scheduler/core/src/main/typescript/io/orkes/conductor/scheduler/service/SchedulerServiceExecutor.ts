export interface SchedulerServiceExecutor {
    getExecutorServiceMainQueuePoll(poolSize: number): any;
    getExecutorServiceArchivalQueuePoll(poolSize: number): any;
}
