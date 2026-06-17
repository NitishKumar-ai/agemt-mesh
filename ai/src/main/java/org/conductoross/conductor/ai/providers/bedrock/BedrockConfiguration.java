package org.conductoross.conductor.ai.providers.bedrock;

import java.time.Duration;

import org.apache.commons.lang3.StringUtils;
import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;

@Data
@Component
@NoArgsConstructor
@ConfigurationProperties(prefix = "conductor.ai.bedrock")
public class BedrockConfiguration implements ModelConfiguration<Bedrock> {

    private AwsCredentialsProvider awsCredentialsProvider;
    private String accessKey;
    private String secretKey;
    private String bearerToken;
    private String region = "us-east-1";
    private Duration timeout = Duration.ofSeconds(600);

    public BedrockConfiguration(
            AwsCredentialsProvider awsCredentialsProvider,
            String accessKey,
            String secretKey,
            String bearerToken,
            String region) {
        this.awsCredentialsProvider = awsCredentialsProvider;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.bearerToken = bearerToken;
        this.region = region;
    }

    @Override
    public Bedrock get() {
        return new Bedrock(this);
    }

    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        // Not required
    }

    public AwsCredentialsProvider getAwsCredentialsProvider() {
        // If bearer token is configured, return null (bearer auth handled separately)
        if (isBearerTokenConfigured()) {
            // Use anonymous credentials as placeholder - bearer token will be used via HTTP
            // client
            return AnonymousCredentialsProvider.create();
        }
        return awsCredentialsProvider == null
                ? StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(getAccessKey(), getSecretKey()))
                : awsCredentialsProvider;
    }

    /** Check if bearer token authentication is configured. */
    public boolean isBearerTokenConfigured() {
        return StringUtils.isNotBlank(bearerToken);
    }
}
