package org.conductoross.conductor.model.file;

import java.util.Objects;

/** Response to {@code GET /api/files/{fileId}/download-url}. Requires status {@code UPLOADED}. */
public class FileDownloadUrlResponse {

    private String fileHandleId;

    private String downloadUrl;

    private long expiresAt;

    public String getFileHandleId() {
        return fileHandleId;
    }

    public void setFileHandleId(String fileHandleId) {
        this.fileHandleId = fileHandleId;
    }

    public String getDownloadUrl() {
        return downloadUrl;
    }

    public void setDownloadUrl(String downloadUrl) {
        this.downloadUrl = downloadUrl;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(long expiresAt) {
        this.expiresAt = expiresAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FileDownloadUrlResponse that)) return false;
        return Objects.equals(fileHandleId, that.fileHandleId)
                && Objects.equals(downloadUrl, that.downloadUrl);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fileHandleId, downloadUrl);
    }

    @Override
    public String toString() {
        return "FileDownloadUrlResponse{fileHandleId='%s', expiresAt=%d}"
                .formatted(fileHandleId, expiresAt);
    }
}
