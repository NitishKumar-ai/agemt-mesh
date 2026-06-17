package org.conductoross.conductor.ai.models;

import java.util.List;
import java.util.Map;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class VectorDBInput extends LLMWorkerInput {

    // Location where to index/query the data to/from
    private String vectorDB;
    private String index;
    private String namespace;

    private List<Float> embeddings;
    private String query;

    private Map<String, Object> metadata;
    private Integer dimensions;

    // Name of the embedding model and its provider integration
    private String embeddingModel;
    private String embeddingModelProvider;
}
