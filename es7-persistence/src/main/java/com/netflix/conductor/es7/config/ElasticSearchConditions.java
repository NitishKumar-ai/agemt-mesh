package com.netflix.conductor.es7.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

public class ElasticSearchConditions {

    private ElasticSearchConditions() {}

    public static class ElasticSearchV7Enabled extends AllNestedConditions {

        ElasticSearchV7Enabled() {
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
                havingValue = "7",
                matchIfMissing = true)
        static class enabledES7 {}

        @SuppressWarnings("unused")
        @ConditionalOnProperty(name = "conductor.indexing.type", havingValue = "elasticsearch")
        static class elasticsearchIndexingType {}
    }
}
