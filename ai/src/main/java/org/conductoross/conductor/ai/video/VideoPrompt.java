package org.conductoross.conductor.ai.video;

import java.util.List;
import java.util.Objects;

import org.springframework.ai.model.ModelRequest;

/**
 * Prompt for video generation requests.
 *
 * <p>Mirrors Spring AI's {@code ImagePrompt} pattern. Implements {@link ModelRequest} with a list
 * of {@link VideoMessage} instructions and {@link VideoOptions} for model configuration.
 *
 * <p>Input images for image-to-video generation are specified via {@link
 * VideoOptions#getInputImage()} rather than as a field on the prompt itself.
 */
public class VideoPrompt implements ModelRequest<List<VideoMessage>> {

    private final List<VideoMessage> messages;
    private VideoOptions videoOptions;

    public VideoPrompt(List<VideoMessage> messages) {
        this(messages, new VideoOptionsBuilder());
    }

    public VideoPrompt(List<VideoMessage> messages, VideoOptions options) {
        this.messages = List.copyOf(messages);
        this.videoOptions = options;
    }

    public VideoPrompt(VideoMessage message, VideoOptions options) {
        this(List.of(message), options);
    }

    public VideoPrompt(String instructions, VideoOptions options) {
        this(List.of(new VideoMessage(instructions)), options);
    }

    public VideoPrompt(String instructions) {
        this(instructions, new VideoOptionsBuilder());
    }

    @Override
    public List<VideoMessage> getInstructions() {
        return messages;
    }

    @Override
    public VideoOptions getOptions() {
        return videoOptions;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof VideoPrompt that)) return false;
        return Objects.equals(messages, that.messages)
                && Objects.equals(videoOptions, that.videoOptions);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messages, videoOptions);
    }

    @Override
    public String toString() {
        return "VideoPrompt{messages=%s, options=%s}".formatted(messages, videoOptions);
    }
}
