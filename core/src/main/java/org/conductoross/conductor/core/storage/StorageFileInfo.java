package org.conductoross.conductor.core.storage;

/**
 * Value object returned by {@link FileStorage#getStorageFileInfo(String)}. Carries existence plus
 * backend-reported content hash and actual byte size.
 */
public class StorageFileInfo {

    private boolean exists;
    private String contentHash;
    private long contentSize;

    public boolean isExists() {
        return exists;
    }

    public void setExists(boolean exists) {
        this.exists = exists;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public long getContentSize() {
        return contentSize;
    }

    public void setContentSize(long contentSize) {
        this.contentSize = contentSize;
    }
}
