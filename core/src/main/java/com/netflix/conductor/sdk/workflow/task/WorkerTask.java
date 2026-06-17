package com.netflix.conductor.sdk.workflow.task;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Identifies a simple worker task. */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD})
public @interface WorkerTask {
    String value();

    // No. of threads to use for executing the task
    int threadCount() default 1;

    int pollingInterval() default 100;

    String domain() default "";

    // In millis
    int pollTimeout() default 100;

    // number of task pollers
    // default is 1 which is good enough for most use cases
    // a number higher than 1 will have concurrent pollers doing poll and execute
    int pollerCount() default 1;
}
