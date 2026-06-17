package com.netflix.conductor.test.config;

import java.net.URI;

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
 * Test configuration that overrides production S3 beans to point to LocalStack. This configuration
 * is only active when external payload storage type is set to S3 and allows tests to run against
 * LocalStack instead of real AWS S3.
 */
@TestConfiguration
@ConditionalOnProperty(name = "conductor.external-payload-storage.type", havingValue = "s3")
public class LocalStackS3Configuration {

    private static String localStackEndpoint;

    /**
     * Sets the LocalStack endpoint URL for S3 client configuration. This method should be called
     * from test setup before Spring context initialization.
     */
    public static void setLocalStackEndpoint(String endpoint) {
        localStackEndpoint = endpoint;
    }

    /**
     * Creates an S3Client configured for LocalStack. This bean overrides the production S3Client
     * bean during testing.
     */
    @Bean
    @Primary
    public S3Client localStackS3Client() {
        var builder =
                S3Client.builder()
                        .region(Region.US_EAST_1)
                        .credentialsProvider(
                                StaticCredentialsProvider.create(
                                        AwsBasicCredentials.create("test", "test")))
                        .forcePathStyle(true); // Required for LocalStack S3 compatibility

        // Configure LocalStack endpoint if available
        if (localStackEndpoint != null) {
            builder.endpointOverride(URI.create(localStackEndpoint));
        }

        return builder.build();
    }

    /**
     * Creates an S3Presigner configured for LocalStack. This bean overrides the production
     * S3Presigner bean during testing.
     */
    @Bean
    @Primary
    public S3Presigner localStackS3Presigner() {
        var builder =
                S3Presigner.builder()
                        .region(Region.US_EAST_1)
                        .credentialsProvider(
                                StaticCredentialsProvider.create(
                                        AwsBasicCredentials.create("test", "test")));

        // Configure LocalStack endpoint if available
        if (localStackEndpoint != null) {
            builder.endpointOverride(URI.create(localStackEndpoint));
        }

        return builder.build();
    }
}
