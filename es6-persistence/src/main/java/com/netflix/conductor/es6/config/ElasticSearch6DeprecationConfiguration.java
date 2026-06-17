package com.netflix.conductor.es6.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

/**
 * Deprecation stub for Elasticsearch 6.x support.
 *
 * <p>This configuration activates when {@code conductor.indexing.type=elasticsearch_v6} is used,
 * which is now deprecated. Elasticsearch 6.x reached end-of-life in November 2020.
 *
 * <p><b>Migration Required:</b>
 *
 * <p>Change your configuration to use Elasticsearch 7.x:
 *
 * <pre>{@code
 * # FROM:
 * conductor.indexing.type=elasticsearch_v6
 * conductor.elasticsearch.url=http://localhost:9200
 *
 * # TO:
 * conductor.indexing.type=elasticsearch
 * conductor.elasticsearch.url=http://localhost:9200
 * }</pre>
 *
 * <p>For legacy code reference, the Elasticsearch 6.x implementation has been archived at: <a
 * href="https://github.com/conductor-oss/conductor-es6-persistence">conductor-es6-persistence</a>
 *
 * @see <a href="https://github.com/conductor-oss/conductor-es6-persistence">Elasticsearch 6.x
 *     Archive</a>
 */
@Configuration
@ConditionalOnProperty(name = "conductor.indexing.type", havingValue = "elasticsearch_v6")
public class ElasticSearch6DeprecationConfiguration {

    @PostConstruct
    public void failWithMigrationMessage() {
        String message =
                "\n"
                        + "╔════════════════════════════════════════════════════════════════════════════╗\n"
                        + "║  CONFIGURATION ERROR: Elasticsearch 6.x support is deprecated             ║\n"
                        + "╠════════════════════════════════════════════════════════════════════════════╣\n"
                        + "║                                                                            ║\n"
                        + "║  Elasticsearch 6.x reached end-of-life in November 2020.                  ║\n"
                        + "║                                                                            ║\n"
                        + "║  REQUIRED ACTION: Upgrade to Elasticsearch 7.x                            ║\n"
                        + "║                                                                            ║\n"
                        + "║  FROM:                                                                     ║\n"
                        + "║    conductor.indexing.type=elasticsearch_v6                               ║\n"
                        + "║                                                                            ║\n"
                        + "║  TO:                                                                       ║\n"
                        + "║    conductor.indexing.type=elasticsearch  # For Elasticsearch 7.x         ║\n"
                        + "║                                                                            ║\n"
                        + "║  All other conductor.elasticsearch.* properties remain the same.          ║\n"
                        + "║                                                                            ║\n"
                        + "║  Legacy code: github.com/conductor-oss/conductor-es6-persistence          ║\n"
                        + "║                                                                            ║\n"
                        + "╚════════════════════════════════════════════════════════════════════════════╝\n";

        throw new IllegalStateException(message);
    }
}
