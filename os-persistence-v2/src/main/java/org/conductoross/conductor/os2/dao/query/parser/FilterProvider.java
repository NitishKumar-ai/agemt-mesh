package org.conductoross.conductor.os2.dao.query.parser;

import org.opensearch.index.query.QueryBuilder;

/**
 * @author Viren
 */
public interface FilterProvider {

    /**
     * @return FilterBuilder for elasticsearch
     */
    public QueryBuilder getFilterBuilder();
}
