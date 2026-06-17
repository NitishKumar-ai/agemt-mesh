package com.netflix.conductor.common.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Response object to return a list of succeeded entities and a map of failed ones, including error
 * message, for the bulk request.
 *
 * @param <T> the type of entities included in the successful results
 */
public class BulkResponse<T> {

    /** Key - entityId Value - error message processing this entity */
    private final Map<String, String> bulkErrorResults;

    private final List<T> bulkSuccessfulResults;
    private final String message = "Bulk Request has been processed.";

    public BulkResponse() {
        this.bulkSuccessfulResults = new ArrayList<>();
        this.bulkErrorResults = new HashMap<>();
    }

    public List<T> getBulkSuccessfulResults() {
        return bulkSuccessfulResults;
    }

    public Map<String, String> getBulkErrorResults() {
        return bulkErrorResults;
    }

    public void appendSuccessResponse(T result) {
        bulkSuccessfulResults.add(result);
    }

    public void appendFailedResponse(String id, String errorMessage) {
        bulkErrorResults.put(id, errorMessage);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof BulkResponse that)) {
            return false;
        }
        return Objects.equals(bulkSuccessfulResults, that.bulkSuccessfulResults)
                && Objects.equals(bulkErrorResults, that.bulkErrorResults);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bulkSuccessfulResults, bulkErrorResults, message);
    }

    @Override
    public String toString() {
        return "BulkResponse{"
                + "bulkSuccessfulResults="
                + bulkSuccessfulResults
                + ", bulkErrorResults="
                + bulkErrorResults
                + ", message='"
                + message
                + '\''
                + '}';
    }
}
