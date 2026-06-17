package com.netflix.conductor.core;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

public abstract class LifecycleAwareComponent implements SmartLifecycle {

    private volatile boolean running = false;

    private static final Logger LOGGER = LoggerFactory.getLogger(LifecycleAwareComponent.class);

    @Override
    public final void start() {
        running = true;
        LOGGER.info("{} started.", getClass().getSimpleName());
        doStart();
    }

    @Override
    public final void stop() {
        running = false;
        LOGGER.info("{} stopped.", getClass().getSimpleName());
        doStop();
    }

    @Override
    public final boolean isRunning() {
        return running;
    }

    public void doStart() {}

    public void doStop() {}
}
