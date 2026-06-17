package org.conductoross.conductor.core.exception;

import com.netflix.conductor.core.exception.NonTransientException;

/** Server-side exception for file-storage failures (verification, storage backend errors). */
public class FileStorageException extends NonTransientException {

    public FileStorageException(String message) {
        super(message);
    }

    public FileStorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
