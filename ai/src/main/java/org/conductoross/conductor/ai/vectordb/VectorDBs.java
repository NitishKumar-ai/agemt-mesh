package org.conductoross.conductor.ai.vectordb;

import java.util.List;
import java.util.Map;

import org.conductoross.conductor.ai.models.IndexedDoc;
import org.springframework.stereotype.Component;

import com.netflix.conductor.sdk.workflow.executor.task.NonRetryableException;
import com.netflix.conductor.sdk.workflow.executor.task.TaskContext;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class VectorDBs {

    private final VectorDBProvider vectorDBProvider;

    public VectorDBs(VectorDBProvider vectorDBProvider) {
        this.vectorDBProvider = vectorDBProvider;
        log.info("vectorDBProvider: {}", vectorDBProvider);
    }

    public int storeEmbeddings(
            String vectorDBName,
            TaskContext context,
            String indexName,
            String namespace,
            String text,
            String parentDocId,
            String id,
            List<Float> embeddings,
            Map<String, Object> metadata) {
        VectorDB db = vectorDBProvider.get(vectorDBName, context);
        if (db == null) {
            throw new NonRetryableException("VectorDB not found: " + vectorDBName);
        }
        return db.updateEmbeddings(
                indexName, namespace, text, parentDocId, id, embeddings, metadata);
    }

    public List<IndexedDoc> searchEmbeddings(
            String vectorDBName,
            TaskContext context,
            String indexName,
            String namespace,
            List<Float> embeddings,
            int maxResults) {
        VectorDB db = vectorDBProvider.get(vectorDBName, context);
        if (db == null) {
            throw new NonRetryableException("VectorDB not found: " + vectorDBName);
        }
        return db.search(indexName, namespace, embeddings, maxResults);
    }
}
