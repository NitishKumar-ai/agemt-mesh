package org.conductoross.conductor.azureblob.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.file-storage.azure-blob")
public class AzureBlobFileStorageProperties {

    private String containerName;
    private String connectionString;

    public String getContainerName() {
        return containerName;
    }

    public void setContainerName(String containerName) {
        this.containerName = containerName;
    }

    public String getConnectionString() {
        return connectionString;
    }

    public void setConnectionString(String connectionString) {
        this.connectionString = connectionString;
    }
}
