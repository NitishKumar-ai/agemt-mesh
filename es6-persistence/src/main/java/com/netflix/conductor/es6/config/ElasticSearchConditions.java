package com.netflix.conductor.es6.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public class ElasticSearchConditions {

    private ElasticSearchConditions() {}

    public static class ElasticSearchV6Enabled extends AllNestedConditions {

        ElasticSearchV6Enabled() {
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
                name = "conductor.elasticsearch.version",
                havingValue = "6",
                matchIfMissing = true)
        static class enabledES6 {}

        @SuppressWarnings("unused")
        @ConditionalOnProperty(name = "conductor.indexing.type", havingValue = "elasticsearch")
        static class elasticsearchIndexingType {}
    }
}
