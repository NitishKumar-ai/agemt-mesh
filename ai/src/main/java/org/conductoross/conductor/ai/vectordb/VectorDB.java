package org.conductoross.conductor.ai.vectordb;

import java.util.List;
import java.util.Map;

import org.conductoross.conductor.ai.models.IndexedDoc;

public abstract class VectorDB {

    protected String name;
    protected String type;

    public VectorDB(String name, String type) {
        this.name = name;
        this.type = type;
    }

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public abstract int updateEmbeddings(
            String indexName,
            String namespace,
            String doc,
            String parentDocId,
            String id,
            List<Float> embeddings,
            Map<String, Object> metadata);

    public abstract List<IndexedDoc> search(
            String indexName, String namespace, List<Float> embeddings, int maxResults);
}
