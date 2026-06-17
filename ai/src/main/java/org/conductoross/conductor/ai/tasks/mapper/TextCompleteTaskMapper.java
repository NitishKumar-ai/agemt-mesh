package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.TextCompletion;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class TextCompleteTaskMapper extends AIModelTaskMapper<TextCompletion> {

    public static final String NAME = "LLM_TEXT_COMPLETE";

    public TextCompleteTaskMapper() {
        super(NAME);
    }
}
