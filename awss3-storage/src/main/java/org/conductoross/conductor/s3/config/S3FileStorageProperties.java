package org.conductoross.conductor.s3.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.file-storage.s3")
public class S3FileStorageProperties {

    private String bucketName;
    private String region = "us-east-1";

    public String getBucketName() {
        return bucketName;
    }

    public void setBucketName(String bucketName) {
        this.bucketName = bucketName;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }
}
