package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.ImageGenRequest;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class ImageGenerationTaskMapper extends AIModelTaskMapper<ImageGenRequest> {

    public static final String NAME = "GENERATE_IMAGE";

    public ImageGenerationTaskMapper() {
        super(NAME);
    }
}
