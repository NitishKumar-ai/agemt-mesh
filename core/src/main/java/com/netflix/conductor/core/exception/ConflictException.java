package com.netflix.conductor.core.exception;

public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }

    public ConflictException(String message, Object... args) {
        super(String.format(message, args));
    }

    public ConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}
