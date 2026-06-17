package io.orkes.conductor.scheduler.service;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import com.google.common.util.concurrent.ThreadFactoryBuilder;

public interface SchedulerServiceExecutor {

    default ScheduledExecutorService getExecutorServiceMainQueuePoll(int poolSize) {
        return Executors.newScheduledThreadPool(
                poolSize, new ThreadFactoryBuilder().setNameFormat("scheduler-thread-%d").build());
    }

    default ScheduledExecutorService getExecutorServiceArchivalQueuePoll(int poolSize) {
        return Executors.newScheduledThreadPool(
                poolSize,
                new ThreadFactoryBuilder().setNameFormat("scheduler-archival-thread-%d").build());
    }
}
