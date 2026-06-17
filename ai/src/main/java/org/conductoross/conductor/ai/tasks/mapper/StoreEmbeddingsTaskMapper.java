package org.conductoross.conductor.ai.tasks.mapper;

import org.conductoross.conductor.ai.models.StoreEmbeddingsInput;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class StoreEmbeddingsTaskMapper extends AIModelTaskMapper<StoreEmbeddingsInput> {

    public static final String NAME = "LLM_STORE_EMBEDDINGS";

    public StoreEmbeddingsTaskMapper() {
        super(NAME);
    }
}
