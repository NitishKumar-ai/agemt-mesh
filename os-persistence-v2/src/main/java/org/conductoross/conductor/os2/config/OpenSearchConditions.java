package org.conductoross.conductor.os2.config;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Conditional configuration for enabling OpenSearch 2.x as the indexing backend.
 *
 * <p>OpenSearch 2.x is enabled when:
 *
 * <ul>
 *   <li>{@code conductor.indexing.enabled=true} (defaults to true if not specified)
 *   <li>{@code conductor.indexing.type=opensearch2}
 * </ul>
 *
 * <p><b>Recommended Configuration:</b>
 *
 * <pre>{@code
 * # Enable OpenSearch 2.x indexing
 * conductor.indexing.enabled=true
 * conductor.indexing.type=opensearch2
 *
 * # OpenSearch connection settings
 * conductor.opensearch.url=http://localhost:9200
 * conductor.opensearch.indexPrefix=conductor
 * conductor.opensearch.indexReplicasCount=0
 * conductor.opensearch.clusterHealthColor=green
 * }</pre>
 */
public class OpenSearchConditions {

    private OpenSearchConditions() {}

    public static class OpenSearchV2Enabled extends AllNestedConditions {

        OpenSearchV2Enabled() {
            super(ConfigurationPhase.PARSE_CONFIGURATION);
        }

        @SuppressWarnings("unused")
        @ConditionalOnProperty(
                name = "conductor.indexing.enabled",
                havingValue = "true",
                matchIfMissing = true)
        static class enabledIndexing {}

        @SuppressWarnings("unused")
        @ConditionalOnProperty(name = "conductor.indexing.type", havingValue = "opensearch2")
        static class enabledOS2 {}
    }
}
