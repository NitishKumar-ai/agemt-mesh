package com.netflix.conductor.s3.config;

import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.convert.DurationUnit;

@ConfigurationProperties("conductor.external-payload-storage.s3")
public class S3Properties {

    /** The s3 bucket name where the payloads will be stored */
    private String bucketName = "conductor_payloads";

    /** The time (in seconds) for which the signed url will be valid */
    @DurationUnit(ChronoUnit.SECONDS)
    private Duration signedUrlExpirationDuration = Duration.ofSeconds(5);

    /** The AWS region of the s3 bucket */
    private String region = "us-east-1";

    public String getBucketName() {
        return bucketName;
    }

    public void setBucketName(String bucketName) {
        this.bucketName = bucketName;
    }

    public Duration getSignedUrlExpirationDuration() {
        return signedUrlExpirationDuration;
    }

    public void setSignedUrlExpirationDuration(Duration signedUrlExpirationDuration) {
        this.signedUrlExpirationDuration = signedUrlExpirationDuration;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }
}
