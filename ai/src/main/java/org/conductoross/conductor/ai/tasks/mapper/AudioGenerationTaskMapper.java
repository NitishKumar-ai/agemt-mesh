package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.AudioGenRequest;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class AudioGenerationTaskMapper extends AIModelTaskMapper<AudioGenRequest> {

    public static final String NAME = "GENERATE_AUDIO";

    public AudioGenerationTaskMapper() {
        super(NAME);
    }
}
