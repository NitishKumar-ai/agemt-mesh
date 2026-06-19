import { MockExecutorService } from './MockExecutorService';

export class MockExecutor {
    private executorServiceMainQueuePoll: MockExecutorService = new MockExecutorService();
    private executorServiceArchivalQueuePoll: MockExecutorService = new MockExecutorService();

    public getExecutorServiceMainQueuePoll(poolSize: number): MockExecutorService {
        return this.executorServiceMainQueuePoll;
    }

    public getExecutorServiceArchivalQueuePoll(poolSize: number): MockExecutorService {
        return this.executorServiceArchivalQueuePoll;
    }
}
