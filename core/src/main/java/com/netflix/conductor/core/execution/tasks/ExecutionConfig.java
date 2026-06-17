package com.netflix.conductor.core.execution.tasks;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.commons.lang3.concurrent.BasicThreadFactory;

import com.netflix.conductor.core.utils.SemaphoreUtil;

class ExecutionConfig {

    private final ExecutorService executorService;
    private final SemaphoreUtil semaphoreUtil;

    ExecutionConfig(int threadCount, String threadNameFormat) {

        this.executorService =
                Executors.newFixedThreadPool(
                        threadCount,
                        new BasicThreadFactory.Builder().namingPattern(threadNameFormat).build());

        this.semaphoreUtil = new SemaphoreUtil(threadCount);
    }

    public ExecutorService getExecutorService() {
        return executorService;
    }

    public SemaphoreUtil getSemaphoreUtil() {
        return semaphoreUtil;
    }
}
