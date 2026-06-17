package org.conductoross.conductor.model.file;

/** Server-authoritative upload lifecycle state. */
public enum FileUploadStatus {
    /** Reserved for future use; not entered by the current flow. */
    PENDING,
    UPLOADING,
    UPLOADED,
    /** Set by the background audit when an {@link #UPLOADING} record remains stale. */
    FAILED
}
