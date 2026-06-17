package org.conductoross.conductor.model.file;

import java.util.List;
import java.util.Objects;

/**
 * Payload for {@code POST /api/files/{fileId}/multipart/{uploadId}/complete}. {@code partETags} is
 * the ordered list of ETags (or backend equivalents) from each part upload.
 */
public class MultipartCompleteRequest {

    private List<String> partETags;

    public List<String> getPartETags() {
        return partETags;
    }

    public void setPartETags(List<String> partETags) {
        this.partETags = partETags;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MultipartCompleteRequest that)) return false;
        return Objects.equals(partETags, that.partETags);
    }

    @Override
    public int hashCode() {
        return Objects.hash(partETags);
    }

    @Override
    public String toString() {
        return "MultipartCompleteRequest{"
                + "partETags.size="
                + (partETags != null ? partETags.size() : 0)
                + '}';
    }
}
