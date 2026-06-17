package org.conductoross.conductor.model.file;

/**
 * Storage backend identifier. Shared between server and SDK — the server stamps its configured type
 * onto every file; the SDK selects a matching {@code FileStorageBackend}.
 */
public enum StorageType {
    S3,
    AZURE_BLOB,
    GCS,
    /** Server-local filesystem. Does not support multipart. */
    LOCAL
}
