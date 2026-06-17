package com.netflix.conductor.es7.dao.index;

import java.util.Objects;

import org.elasticsearch.action.bulk.BulkRequest;
import org.elasticsearch.action.index.IndexRequest;
import org.elasticsearch.action.update.UpdateRequest;
import org.springframework.lang.NonNull;

/** Thread-safe wrapper for {@link BulkRequest}. */
class BulkRequestWrapper {
    private final BulkRequest bulkRequest;

    BulkRequestWrapper(@NonNull BulkRequest bulkRequest) {
        this.bulkRequest = Objects.requireNonNull(bulkRequest);
    }

    public void add(@NonNull UpdateRequest req) {
        synchronized (bulkRequest) {
            bulkRequest.add(Objects.requireNonNull(req));
        }
    }

    public void add(@NonNull IndexRequest req) {
        synchronized (bulkRequest) {
            bulkRequest.add(Objects.requireNonNull(req));
        }
    }

    BulkRequest get() {
        return bulkRequest;
    }

    int numberOfActions() {
        synchronized (bulkRequest) {
            return bulkRequest.numberOfActions();
        }
    }
}
