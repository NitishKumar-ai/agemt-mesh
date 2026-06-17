package org.conductoross.conductor.os3.dao.query.parser;

import org.opensearch.client.opensearch._types.query_dsl.Query;

/**
 * @author Viren
 */
public interface FilterProvider {

    /**
     * @return Query filter for opensearch
     */
    public Query getFilter();
}
