package org.conductoross.conductor.model.file;

/**
 * Converts between the bare {@code fileId} (URL path variables, {@code FileModel}, DAO/service
 * params) and the prefixed {@code fileHandleId} ({@code conductor://file/<fileId>}) used in JSON
 * DTOs. Idempotent in both directions.
 */
public final class FileIdToFileHandleIdConverter {

    public static final String PREFIX = "conductor://file/";

    private FileIdToFileHandleIdConverter() {}

    public static String toFileHandleId(String fileId) {
        return fileId.startsWith(PREFIX) ? fileId : PREFIX + fileId;
    }

    public static String toFileId(String value) {
        return value.startsWith(PREFIX) ? value.substring(PREFIX.length()) : value;
    }

    public static boolean isFileHandleId(Object value) {
        return value instanceof String s && s.startsWith(PREFIX);
    }
}
