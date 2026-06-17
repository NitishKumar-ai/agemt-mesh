package com.netflix.conductor.es7.dao.query.parser;

import org.elasticsearch.index.query.QueryBuilder;

/**
 * @author Viren
 */
public interface FilterProvider {

    /**
     * @return FilterBuilder for elasticsearch
     */
    public QueryBuilder getFilterBuilder();
}
