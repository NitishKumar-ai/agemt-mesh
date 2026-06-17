package com.netflix.conductor.sdk.workflow.executor.task;

/**
 * Exception thrown when a worker method execution should not be retried. This maps to
 * FAILED_WITH_TERMINAL_ERROR status.
 */
public class NonRetryableException extends RuntimeException {

    public NonRetryableException(String message) {
        super(message);
    }

    public NonRetryableException(String message, Throwable cause) {
        super(message, cause);
    }

    public NonRetryableException(Throwable cause) {
        super(cause);
    }
}
