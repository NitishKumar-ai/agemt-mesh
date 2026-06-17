package com.netflix.conductor.test.config;

import org.conductoross.conductor.azureblob.config.AzureBlobFileStorageProperties;
import org.conductoross.conductor.azureblob.storage.AzureBlobFileStorage;
import org.conductoross.conductor.core.storage.FileStorage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import com.netflix.conductor.core.utils.IDGenerator;

import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;

/**
 * Replaces the production file-storage Azure Blob beans with an Azurite-pointed {@link
 * FileStorage}. The spec sets {@link AzureBlobFileStorageProperties#getConnectionString()} via
 * {@code @TestPropertySource} with the container-aware connection string.
 */
@TestConfiguration
@ConditionalOnProperty(name = "conductor.file-storage.type", havingValue = "azure-blob")
public class AzuriteFileStorageConfiguration {

    private static String connectionString;

    public static void setConnectionString(String cs) {
        connectionString = cs;
    }

    @Bean
    @Primary
    public FileStorage azuriteFileStorage(
            IDGenerator idGenerator, AzureBlobFileStorageProperties properties) {
        if (connectionString != null) {
            properties.setConnectionString(connectionString);
        }
        BlobServiceClient client =
                new BlobServiceClientBuilder()
                        .connectionString(properties.getConnectionString())
                        .buildClient();
        var containerClient = client.getBlobContainerClient(properties.getContainerName());
        if (!containerClient.exists()) {
            containerClient.create();
        }
        return new AzureBlobFileStorage(idGenerator, containerClient);
    }
}
