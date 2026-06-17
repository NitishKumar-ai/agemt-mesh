package com.netflix.conductor.contribs.queue.amqp.util;

/** RetryType holds the retry type */
public enum RetryType {
    REGULARINTERVALS,
    EXPONENTIALBACKOFF,
    INCREMENTALINTERVALS
}
