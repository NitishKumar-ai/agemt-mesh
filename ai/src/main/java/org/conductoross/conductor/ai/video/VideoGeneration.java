package org.conductoross.conductor.ai.video;

import org.springframework.ai.model.ModelResult;

/**
 * Represents a single video generation result.
 *
 * <p>Mirrors Spring AI's {@code ImageGeneration} pattern. Implements {@link ModelResult} with
 * {@link Video} as the output type, making it compatible with the Spring AI model abstraction.
 */
public class VideoGeneration implements ModelResult<Video> {

    private Video video;
    private VideoGenerationMetadata videoGenerationMetadata;

    public VideoGeneration(Video video) {
        this(video, null);
    }

    public VideoGeneration(Video video, VideoGenerationMetadata videoGenerationMetadata) {
        this.video = video;
        this.videoGenerationMetadata = videoGenerationMetadata;
    }

    @Override
    public Video getOutput() {
        return video;
    }

    @Override
    public VideoGenerationMetadata getMetadata() {
        return videoGenerationMetadata;
    }

    @Override
    public String toString() {
        return "VideoGeneration{video=%s, metadata=%s}".formatted(video, videoGenerationMetadata);
    }
}
