package com.netflix.conductor.test.config;

import java.net.URI;

import org.conductoross.conductor.core.storage.FileStorage;
import org.conductoross.conductor.s3.config.S3FileStorageProperties;
import org.conductoross.conductor.s3.storage.S3FileStorage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * Replaces the production file-storage S3 beans with a LocalStack-pointed {@link FileStorage}. The
 * spec calls {@link #setLocalStackEndpoint(String)} in {@code setupSpec} before the Spring context
 * is refreshed.
 */
@TestConfiguration
@ConditionalOnProperty(name = "conductor.file-storage.type", havingValue = "s3")
public class LocalStackS3FileStorageConfiguration {

    private static String localStackEndpoint;

    public static void setLocalStackEndpoint(String endpoint) {
        localStackEndpoint = endpoint;
    }

    @Bean
    @Primary
    public FileStorage localStackS3FileStorage(S3FileStorageProperties properties) {
        var creds = StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test"));
        var s3Builder =
                S3Client.builder()
                        .region(Region.US_EAST_1)
                        .credentialsProvider(creds)
                        .forcePathStyle(true);
        var presignerBuilder =
                S3Presigner.builder().region(Region.US_EAST_1).credentialsProvider(creds);
        if (localStackEndpoint != null) {
            URI endpoint = URI.create(localStackEndpoint);
            s3Builder.endpointOverride(endpoint);
            presignerBuilder.endpointOverride(endpoint);
        }
        return new S3FileStorage(properties, s3Builder.build(), presignerBuilder.build());
    }
}
