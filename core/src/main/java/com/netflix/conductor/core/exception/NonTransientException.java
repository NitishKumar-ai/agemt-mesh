package com.netflix.conductor.core.exception;

public class NonTransientException extends RuntimeException {

    public NonTransientException(String message) {
        super(message);
    }

    public NonTransientException(String message, Throwable cause) {
        super(message, cause);
    }
}
