package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.VectorDBInput;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class SearchIndexTaskMapper extends AIModelTaskMapper<VectorDBInput> {

    public static final String NAME = "LLM_SEARCH_INDEX";

    public SearchIndexTaskMapper() {
        super(NAME);
    }
}
