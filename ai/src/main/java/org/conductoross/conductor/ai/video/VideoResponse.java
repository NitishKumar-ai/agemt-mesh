package org.conductoross.conductor.ai.video;

import java.util.List;
import java.util.Objects;

import org.springframework.ai.model.ModelResponse;

/**
 * Response from a video generation request.
 *
 * <p>Mirrors Spring AI's {@code ImageResponse} pattern. Implements {@link ModelResponse} with
 * {@link VideoGeneration} as the result type. Contains the list of generated videos and
 * response-level metadata including job status for async operations.
 */
public class VideoResponse implements ModelResponse<VideoGeneration> {

    private final List<VideoGeneration> videoGenerations;
    private final VideoResponseMetadata videoResponseMetadata;

    public VideoResponse(List<VideoGeneration> generations) {
        this(generations, new VideoResponseMetadata());
    }

    public VideoResponse(List<VideoGeneration> generations, VideoResponseMetadata metadata) {
        this.videoGenerations = List.copyOf(generations);
        this.videoResponseMetadata = metadata;
    }

    @Override
    public VideoGeneration getResult() {
        return videoGenerations.isEmpty() ? null : videoGenerations.getFirst();
    }

    @Override
    public List<VideoGeneration> getResults() {
        return videoGenerations;
    }

    @Override
    public VideoResponseMetadata getMetadata() {
        return videoResponseMetadata;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof VideoResponse that)) return false;
        return Objects.equals(videoGenerations, that.videoGenerations)
                && Objects.equals(videoResponseMetadata, that.videoResponseMetadata);
    }

    @Override
    public int hashCode() {
        return Objects.hash(videoGenerations, videoResponseMetadata);
    }

    @Override
    public String toString() {
        return "VideoResponse{generations=%s, metadata=%s}"
                .formatted(videoGenerations, videoResponseMetadata);
    }
}
