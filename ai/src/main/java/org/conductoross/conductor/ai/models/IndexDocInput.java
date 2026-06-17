package org.conductoross.conductor.ai.models;

import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class IndexDocInput extends LLMWorkerInput {

    private String embeddingModelProvider;
    private String embeddingModel;
    private String vectorDB;
    private String text;
    private String docId;
    private String url;
    private String mediaType;
    private String namespace;
    private String index;
    private int chunkSize;
    private int chunkOverlap;
    private Map<String, Object> metadata;
    private Integer dimensions;
    private String integrationName;

    public String getNamespace() {
        if (namespace == null) {
            return docId;
        }
        return namespace;
    }

    public int getChunkSize() {
        return chunkSize > 0 ? chunkSize : 12000;
    }

    public int getChunkOverlap() {
        return chunkOverlap > 0 ? chunkOverlap : 400;
    }
}
