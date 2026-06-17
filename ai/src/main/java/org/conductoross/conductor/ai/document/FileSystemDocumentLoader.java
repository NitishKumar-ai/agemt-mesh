package org.conductoross.conductor.ai.document;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@ConditionalOnProperty(
        value = "conductor.worker.document-loader.type",
        havingValue = "file",
        matchIfMissing = true)
@Slf4j
public class FileSystemDocumentLoader implements DocumentLoader {

    private final DocumentAccessPolicy accessPolicy;

    public FileSystemDocumentLoader(DocumentAccessPolicy accessPolicy) {
        this.accessPolicy = accessPolicy;
    }

    @Override
    public byte[] download(String location) {
        accessPolicy.validateAccess(location);
        try {

            return Files.readAllBytes(Path.of(location.replace("file://", "")));

        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public String upload(
            Map<String, String> headers, String contentType, byte[] data, String fileURI) {
        try {
            if (data == null) {
                return null;
            }
            accessPolicy.validateAccess(fileURI);
            Path path = Path.of(fileURI.replace("file://", ""));
            var result = path.toFile().getParentFile().mkdirs();
            log.info("writing to {}", path);
            Files.write(path, data);
            return "file://" + path.toAbsolutePath().toString();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Streaming upload that writes directly from an InputStream to the filesystem without buffering
     * the entire content in memory. Suitable for large files such as video.
     */
    @Override
    public String upload(
            Map<String, String> headers, String contentType, InputStream data, String fileURI) {
        try {
            if (data == null) {
                return null;
            }
            accessPolicy.validateAccess(fileURI);
            Path path = Path.of(fileURI.replace("file://", ""));
            path.toFile().getParentFile().mkdirs();
            Files.copy(data, path, StandardCopyOption.REPLACE_EXISTING);
            return "file://" + path.toAbsolutePath().toString();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public List<String> listFiles(String location) {
        accessPolicy.validateAccess(location);
        try (Stream<Path> paths = Files.list(Path.of(new URI(location)))) {
            return paths.map(path -> path.toUri().toString()).toList();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public boolean supports(String location) {
        // either starts with fileURI or does not contain URI scheme
        return location.startsWith("file://") || !location.contains("://");
    }
}
