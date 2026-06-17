package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.VideoGenRequest;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task mapper for video generation tasks.
 *
 * <p>Maps GENERATE_VIDEO workflow tasks to system tasks.
 */
@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class VideoGenerationTaskMapper extends AIModelTaskMapper<VideoGenRequest> {

    public static final String NAME = "GENERATE_VIDEO";

    protected VideoGenerationTaskMapper() {
        super(NAME);
    }
}
