package com.netflix.conductor.es7.dao.index;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.utility.DockerImageName;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;
import com.netflix.conductor.es7.config.ElasticSearchProperties;

import com.fasterxml.jackson.databind.ObjectMapper;

@ContextConfiguration(
        classes = {TestObjectMapperConfiguration.class, ElasticSearchTest.TestConfiguration.class})
@RunWith(SpringRunner.class)
@TestPropertySource(
        properties = {"conductor.indexing.enabled=true", "conductor.elasticsearch.version=7"})
public abstract class ElasticSearchTest {

    @Configuration
    static class TestConfiguration {

        @Bean
        public ElasticSearchProperties elasticSearchProperties() {
            return new ElasticSearchProperties();
        }
    }

    protected static final ElasticsearchContainer container =
            new ElasticsearchContainer(
                    DockerImageName.parse("elasticsearch")
                            .withTag("7.17.11")); // this should match the client version

    @Autowired protected ObjectMapper objectMapper;

    @Autowired protected ElasticSearchProperties properties;

    @BeforeClass
    public static void startServer() {
        container.start();
    }

    @AfterClass
    public static void stopServer() {
        container.stop();
    }
}
