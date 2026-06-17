package org.conductoross.conductor.es8.config;

import org.junit.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ElasticSearchConditionsTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(ConditionalTestConfiguration.class);

    @Test
    public void shouldActivateForElasticsearch8IndexingType() {
        contextRunner
                .withPropertyValues(
                        "conductor.indexing.enabled=true", "conductor.indexing.type=elasticsearch8")
                .run(context -> assertTrue(context.containsBean("es8Marker")));
    }

    @Test
    public void shouldNotActivateWhenIndexingIsDisabled() {
        contextRunner
                .withPropertyValues(
                        "conductor.indexing.enabled=false",
                        "conductor.indexing.type=elasticsearch8")
                .run(context -> assertFalse(context.containsBean("es8Marker")));
    }

    @Test
    public void shouldNotActivateForLegacyVersionPropertyOnly() {
        contextRunner
                .withPropertyValues(
                        "conductor.indexing.enabled=true", "conductor.elasticsearch.version=8")
                .run(context -> assertFalse(context.containsBean("es8Marker")));
    }

    @Test
    public void shouldNotActivateForElasticsearchV7Selector() {
        contextRunner
                .withPropertyValues(
                        "conductor.indexing.enabled=true", "conductor.indexing.type=elasticsearch")
                .run(context -> assertFalse(context.containsBean("es8Marker")));
    }

    @Configuration(proxyBeanMethods = false)
    @Conditional(ElasticSearchConditions.ElasticSearchV8Enabled.class)
    static class ConditionalTestConfiguration {

        @Bean
        Marker es8Marker() {
            return new Marker();
        }
    }

    static class Marker {}
}
