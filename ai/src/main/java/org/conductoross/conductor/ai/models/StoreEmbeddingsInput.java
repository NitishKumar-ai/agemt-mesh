package org.conductoross.conductor.ai.models;

import java.util.List;
import java.util.Map;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class StoreEmbeddingsInput extends LLMWorkerInput {

    private String vectorDB;
    private String index;
    private String namespace;
    private List<Float> embeddings;
    private String id;
    private Map<String, Object> metadata;
    private String embeddingModel;
    private String embeddingModelProvider;
}
