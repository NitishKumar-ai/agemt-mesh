package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.IndexDocInput;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class IndexTextTaskMapper extends AIModelTaskMapper<IndexDocInput> {

    public static final String NAME = "LLM_INDEX_TEXT";

    public IndexTextTaskMapper() {
        super(NAME);
    }
}
