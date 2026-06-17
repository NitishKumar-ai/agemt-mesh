package org.conductoross.conductor.ai.video;

import org.springframework.ai.model.Model;

/**
 * Interface for video generation models.
 *
 * <p>Follows Spring AI's pattern for model interfaces (e.g., ChatModel, ImageModel). This is a
 * functional interface with a single {@code call} method that accepts a {@link VideoPrompt} and
 * returns a {@link VideoResponse}.
 *
 * <p>For providers that use asynchronous job submission and polling (most video providers), see
 * {@link AsyncVideoModel} which extends this interface with status-checking capability.
 *
 * @see AsyncVideoModel
 * @see Model
 */
@FunctionalInterface
public interface VideoModel extends Model<VideoPrompt, VideoResponse> {

    /**
     * Generate a video based on the provided prompt.
     *
     * @param prompt The video generation prompt containing instructions and options
     * @return The video generation response
     */
    @Override
    VideoResponse call(VideoPrompt prompt);
}
