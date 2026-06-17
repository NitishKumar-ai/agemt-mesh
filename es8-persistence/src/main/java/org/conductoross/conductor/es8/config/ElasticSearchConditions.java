package org.conductoross.conductor.es8.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Conditional configuration for enabling Elasticsearch 8.x as the indexing backend.
 *
 * <p>Elasticsearch 8.x is enabled when:
 *
 * <ul>
 *   <li>{@code conductor.indexing.enabled=true} (defaults to true if not specified)
 *   <li>{@code conductor.indexing.type=elasticsearch8}
 * </ul>
 */
public class ElasticSearchConditions {

    private ElasticSearchConditions() {}

    public static class ElasticSearchV8Enabled extends AllNestedConditions {

        ElasticSearchV8Enabled() {
            super(ConfigurationPhase.PARSE_CONFIGURATION);
        }

        @SuppressWarnings("unused")
        @ConditionalOnProperty(
                name = "conductor.indexing.enabled",
                havingValue = "true",
                matchIfMissing = true)
        static class enabledIndexing {}

        @SuppressWarnings("unused")
        @ConditionalOnProperty(
                name = "conductor.indexing.type",
                havingValue = "elasticsearch8",
                matchIfMissing = false)
        static class enabledES8 {}
    }
}
