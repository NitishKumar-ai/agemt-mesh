package org.conductoross.conductor.core.storage;

import java.time.Duration;
import java.util.List;

import org.conductoross.conductor.model.file.StorageType;

/**
 * Pluggable storage backend abstraction. Each implementation encapsulates a backend-specific
 * mechanism for granting temporary access to content (presigned URL, SAS token, signed URL, or
 * direct path) and for reading storage metadata. Supports Bring Your Own Storage via custom
 * implementations.
 */
public interface FileStorage {

    /** Returns the {@link StorageType} this backend handles; stamped onto file metadata. */
    StorageType getStorageType();

    /**
     * Returns a fresh presigned upload URL (or backend-equivalent) for {@code storagePath}. Callers
     * must not cache — a new URL is generated on every call.
     */
    String generateUploadUrl(String storagePath, Duration expiration);

    /** Returns a fresh presigned download URL (or backend-equivalent) for {@code storagePath}. */
    String generateDownloadUrl(String storagePath, Duration expiration);

    /**
     * Reads existence, content hash, and actual byte size from the storage backend in a single
     * call. Returns {@code null} if the object is not present. {@code contentHash} is {@code null}
     * for backends that do not expose one (e.g. local).
     */
    StorageFileInfo getStorageFileInfo(String storagePath);

    /**
     * Starts a backend-native multipart upload. Returns the backend's upload ID (S3 {@code
     * UploadId}, GCS resumable session ID, etc.).
     */
    String initiateMultipartUpload(String storagePath);

    /**
     * Returns a presigned URL for a single part of an S3 multipart upload. Not called for GCS/Azure
     * — those reuse the resumable URL from {@link #initiateMultipartUpload}.
     *
     * @param partNumber 1-based part number
     */
    String generatePartUploadUrl(
            String storagePath, String uploadId, int partNumber, Duration expiration);

    /**
     * Finalizes a multipart upload.
     *
     * @param partETags ordered list of ETags returned by each part upload
     */
    void completeMultipartUpload(String storagePath, String uploadId, List<String> partETags);
}
