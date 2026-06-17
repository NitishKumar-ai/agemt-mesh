package io.orkes.conductor.scheduler.service;

public class MockExecutor implements SchedulerServiceExecutor {

    private MockExecutorService executorServiceMainQueuePoll = new MockExecutorService();
    private MockExecutorService executorServiceArchivalQueuePoll = new MockExecutorService();

    @Override
    public MockExecutorService getExecutorServiceMainQueuePoll(int poolSize) {
        return executorServiceMainQueuePoll;
    }

    @Override
    public MockExecutorService getExecutorServiceArchivalQueuePoll(int poolSize) {
        return executorServiceArchivalQueuePoll;
    }
}
