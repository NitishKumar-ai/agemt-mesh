package org.conductoross.conductor.ai.video;

import org.springframework.ai.model.ResultMetadata;

/**
 * Marker interface for per-generation metadata in video results.
 *
 * <p>Mirrors Spring AI's {@code ImageGenerationMetadata} pattern. Provider-specific metadata (e.g.,
 * finish reason, content filter results) can be stored in implementations of this interface.
 */
public interface VideoGenerationMetadata extends ResultMetadata {}
