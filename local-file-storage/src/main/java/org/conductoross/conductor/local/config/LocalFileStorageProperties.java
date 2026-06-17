package org.conductoross.conductor.local.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.file-storage.local")
public class LocalFileStorageProperties {

    private String directory =
            Path.of(System.getProperty("java.io.tmpdir"), "conductor", "files-uploaded").toString();

    public String getDirectory() {
        return directory;
    }

    public void setDirectory(String directory) {
        this.directory = directory;
    }
}
