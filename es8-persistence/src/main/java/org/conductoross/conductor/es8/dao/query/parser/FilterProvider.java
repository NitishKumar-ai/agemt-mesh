package org.conductoross.conductor.es8.dao.query.parser;

import co.elastic.clients.elasticsearch._types.query_dsl.Query;

/**
 * @author Viren
 */
public interface FilterProvider {

    /**
     * @return FilterBuilder for elasticsearch
     */
    Query getFilterBuilder();
}
