package org.conductoross.conductor.model.file;

import java.util.Objects;

/**
 * Response to {@code POST /api/files/{fileId}/upload-complete}. {@code contentHash} is the
 * backend-reported hash, or {@code null} for backends that do not expose one.
 */
public class FileUploadCompleteResponse {

    private String fileHandleId;

    private FileUploadStatus uploadStatus;

    private String contentHash;

    public String getFileHandleId() {
        return fileHandleId;
    }

    public void setFileHandleId(String fileHandleId) {
        this.fileHandleId = fileHandleId;
    }

    public FileUploadStatus getUploadStatus() {
        return uploadStatus;
    }

    public void setUploadStatus(FileUploadStatus uploadStatus) {
        this.uploadStatus = uploadStatus;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FileUploadCompleteResponse that)) return false;
        return Objects.equals(fileHandleId, that.fileHandleId)
                && uploadStatus == that.uploadStatus
                && Objects.equals(contentHash, that.contentHash);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fileHandleId, uploadStatus, contentHash);
    }

    @Override
    public String toString() {
        return "FileUploadCompleteResponse{fileHandleId='%s', uploadStatus=%s}"
                .formatted(fileHandleId, uploadStatus);
    }
}
