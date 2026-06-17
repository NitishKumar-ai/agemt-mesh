package com.netflix.conductor.core.config;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

import org.apache.commons.lang3.concurrent.BasicThreadFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

import rx.Scheduler;
import rx.schedulers.Schedulers;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableAsync
public class SchedulerConfiguration implements SchedulingConfigurer {

    public static final String SWEEPER_EXECUTOR_NAME = "WorkflowSweeperExecutor";

    /**
     * Used by some {@link com.netflix.conductor.core.events.queue.ObservableQueue} implementations.
     *
     * @see com.netflix.conductor.core.events.queue.ConductorObservableQueue
     */
    @Bean
    public Scheduler scheduler(ConductorProperties properties) {
        ThreadFactory threadFactory =
                new BasicThreadFactory.Builder()
                        .namingPattern("event-queue-poll-scheduler-thread-%d")
                        .build();
        Executor executorService =
                Executors.newFixedThreadPool(
                        properties.getEventQueueSchedulerPollThreadCount(), threadFactory);

        return Schedulers.from(executorService);
    }

    @Bean(SWEEPER_EXECUTOR_NAME)
    public Executor sweeperExecutor(ConductorProperties properties) {
        if (properties.getSweeperThreadCount() <= 0) {
            throw new IllegalStateException(
                    "conductor.app.sweeper-thread-count must be greater than 0.");
        }
        ThreadFactory threadFactory =
                new BasicThreadFactory.Builder().namingPattern("sweeper-thread-%d").build();
        return Executors.newFixedThreadPool(properties.getSweeperThreadCount(), threadFactory);
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        ThreadPoolTaskScheduler threadPoolTaskScheduler = new ThreadPoolTaskScheduler();
        threadPoolTaskScheduler.setPoolSize(3); // equal to the number of scheduled jobs
        threadPoolTaskScheduler.setThreadNamePrefix("scheduled-task-pool-");
        threadPoolTaskScheduler.initialize();
        taskRegistrar.setTaskScheduler(threadPoolTaskScheduler);
    }
}
