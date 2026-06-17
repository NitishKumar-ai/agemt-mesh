package org.conductoross.conductor.model.file;

import java.util.Objects;

/** Response to {@code POST /api/files/{fileId}/multipart} — initiates a multipart upload. */
public class MultipartInitResponse {

    private String fileHandleId;

    /** Backend-specific multipart identifier (S3 {@code UploadId}, GCS resumable session ID). */
    private String uploadId;

    public String getFileHandleId() {
        return fileHandleId;
    }

    public void setFileHandleId(String fileHandleId) {
        this.fileHandleId = fileHandleId;
    }

    public String getUploadId() {
        return uploadId;
    }

    public void setUploadId(String uploadId) {
        this.uploadId = uploadId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MultipartInitResponse that)) return false;
        return Objects.equals(fileHandleId, that.fileHandleId)
                && Objects.equals(uploadId, that.uploadId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fileHandleId, uploadId);
    }

    @Override
    public String toString() {
        return "MultipartInitResponse{fileHandleId='%s', uploadId='%s'}"
                .formatted(fileHandleId, uploadId);
    }
}
