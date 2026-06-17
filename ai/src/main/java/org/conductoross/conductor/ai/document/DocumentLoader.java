package org.conductoross.conductor.ai.document;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;

public interface DocumentLoader {

    byte[] download(String location);

    String upload(Map<String, String> headers, String contentType, byte[] data, String fileURI);

    /**
     * Upload data from an InputStream, allowing streaming of large files (e.g., video) without
     * buffering the entire content in memory.
     *
     * <p>Default implementation reads all bytes into memory and delegates to the byte[]-based
     * upload. Implementations should override this for true streaming behavior.
     */
    default String upload(
            Map<String, String> headers, String contentType, InputStream data, String fileURI) {
        try {
            return upload(headers, contentType, data.readAllBytes(), fileURI);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read InputStream for upload", e);
        }
    }

    List<String> listFiles(String location);

    boolean supports(String location);
}
