package org.conductoross.conductor.gcs.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.file-storage.gcs")
public class GcsFileStorageProperties {

    private String bucketName;
    private String projectId;
    private String credentialsFile;

    public String getBucketName() {
        return bucketName;
    }

    public void setBucketName(String bucketName) {
        this.bucketName = bucketName;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getCredentialsFile() {
        return credentialsFile;
    }

    public void setCredentialsFile(String credentialsFile) {
        this.credentialsFile = credentialsFile;
    }
}
