package org.conductoross.conductor.core.storage.converter;

import java.time.Instant;

import org.conductoross.conductor.model.FileModel;
import org.conductoross.conductor.model.file.*;

/**
 * Converter between {@link FileModel} (bare {@code fileId}, {@code Instant} timestamps) and
 * file-storage DTOs ({@code fileHandleId}, epoch-millis timestamps). Isolates the {@code fileId} ↔
 * {@code fileHandleId} translation via {@link FileIdToFileHandleIdConverter}.
 */
public class FileModelConverter {

    public static FileModel toFileModel(
            FileUploadRequest request, String fileId, String storagePath, StorageType storageType) {
        FileModel model = new FileModel();
        model.setFileId(fileId);
        model.setFileName(request.getFileName());
        model.setContentType(request.getContentType());
        model.setStorageType(storageType);
        model.setStoragePath(storagePath);
        model.setUploadStatus(FileUploadStatus.UPLOADING);
        model.setWorkflowId(request.getWorkflowId());
        model.setTaskId(request.getTaskId());
        model.setCreatedAt(Instant.now());
        model.setUpdatedAt(Instant.now());
        return model;
    }

    public static FileHandle toFileHandle(FileModel model) {
        FileHandle handle = new FileHandle();
        handle.setFileHandleId(FileIdToFileHandleIdConverter.toFileHandleId(model.getFileId()));
        handle.setFileName(model.getFileName());
        handle.setContentType(model.getContentType());
        handle.setContentHash(model.getStorageContentHash());
        handle.setStorageType(model.getStorageType());
        handle.setUploadStatus(model.getUploadStatus());
        handle.setWorkflowId(model.getWorkflowId());
        handle.setTaskId(model.getTaskId());
        handle.setCreatedAt(model.getCreatedAt().toEpochMilli());
        handle.setUpdatedAt(model.getUpdatedAt().toEpochMilli());
        return handle;
    }

    public static FileUploadResponse toFileUploadResponse(
            FileModel model, String uploadUrl, long uploadUrlExpiresAt) {
        FileUploadResponse response = new FileUploadResponse();
        response.setFileHandleId(FileIdToFileHandleIdConverter.toFileHandleId(model.getFileId()));
        response.setFileName(model.getFileName());
        response.setContentType(model.getContentType());
        response.setStorageType(model.getStorageType());
        response.setUploadStatus(model.getUploadStatus());
        response.setUploadUrl(uploadUrl);
        response.setUploadUrlExpiresAt(uploadUrlExpiresAt);
        response.setCreatedAt(model.getCreatedAt().toEpochMilli());
        return response;
    }
}
