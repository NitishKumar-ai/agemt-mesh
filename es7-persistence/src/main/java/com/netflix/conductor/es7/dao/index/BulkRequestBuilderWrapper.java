package com.netflix.conductor.es7.dao.index;

import java.util.Objects;

import org.elasticsearch.action.ActionFuture;
import org.elasticsearch.action.bulk.BulkRequestBuilder;
import org.elasticsearch.action.bulk.BulkResponse;
import org.elasticsearch.action.index.IndexRequest;
import org.elasticsearch.action.update.UpdateRequest;
import org.springframework.lang.NonNull;

/** Thread-safe wrapper for {@link BulkRequestBuilder}. */
public class BulkRequestBuilderWrapper {
    private final BulkRequestBuilder bulkRequestBuilder;

    public BulkRequestBuilderWrapper(@NonNull BulkRequestBuilder bulkRequestBuilder) {
        this.bulkRequestBuilder = Objects.requireNonNull(bulkRequestBuilder);
    }

    public void add(@NonNull UpdateRequest req) {
        synchronized (bulkRequestBuilder) {
            bulkRequestBuilder.add(Objects.requireNonNull(req));
        }
    }

    public void add(@NonNull IndexRequest req) {
        synchronized (bulkRequestBuilder) {
            bulkRequestBuilder.add(Objects.requireNonNull(req));
        }
    }

    public int numberOfActions() {
        synchronized (bulkRequestBuilder) {
            return bulkRequestBuilder.numberOfActions();
        }
    }

    public ActionFuture<BulkResponse> execute() {
        synchronized (bulkRequestBuilder) {
            return bulkRequestBuilder.execute();
        }
    }
}
