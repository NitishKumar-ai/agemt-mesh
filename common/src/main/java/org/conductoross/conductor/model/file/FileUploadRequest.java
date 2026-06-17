package org.conductoross.conductor.model.file;

import java.util.Objects;

import jakarta.validation.constraints.NotBlank;

/** Payload for {@code POST /api/files} — describes the file the client intends to upload. */
public class FileUploadRequest {

    private String fileName;

    private String contentType;

    @NotBlank(message = "workflowId is required")
    private String workflowId;

    private String taskId;

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public String getWorkflowId() {
        return workflowId;
    }

    public void setWorkflowId(String workflowId) {
        this.workflowId = workflowId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FileUploadRequest that)) return false;
        return Objects.equals(fileName, that.fileName)
                && Objects.equals(contentType, that.contentType);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fileName, contentType);
    }

    @Override
    public String toString() {
        return "FileUploadRequest{fileName='%s', contentType='%s'}"
                .formatted(fileName, contentType);
    }
}
