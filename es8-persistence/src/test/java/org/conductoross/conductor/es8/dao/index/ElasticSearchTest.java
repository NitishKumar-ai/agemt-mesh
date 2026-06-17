package org.conductoross.conductor.es8.dao.index;

import org.conductoross.conductor.es8.config.ElasticSearchProperties;
import org.junit.AfterClass;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.utility.DockerImageName;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;

import com.fasterxml.jackson.databind.ObjectMapper;

@ContextConfiguration(
        classes = {TestObjectMapperConfiguration.class, ElasticSearchTest.TestConfiguration.class})
@RunWith(SpringRunner.class)
@TestPropertySource(
        properties = {"conductor.indexing.enabled=true", "conductor.indexing.type=elasticsearch8"})
public abstract class ElasticSearchTest {

    @Configuration
    static class TestConfiguration {

        @Bean
        public ElasticSearchProperties elasticSearchProperties() {
            return new ElasticSearchProperties();
        }
    }

    protected static final ElasticsearchContainer container =
            new ElasticsearchContainer(DockerImageName.parse("elasticsearch").withTag("8.19.11"))
                    .withEnv("xpack.security.enabled", "false")
                    .withEnv("discovery.type", "single-node")
                    .withEnv("ES_JAVA_OPTS", "-Xms512m -Xmx512m");

    @Autowired protected ObjectMapper objectMapper;

    @Autowired protected ElasticSearchProperties properties;

    @BeforeClass
    public static void startServer() {
        try {
            DockerClientFactory.instance().client();
        } catch (Throwable t) {
            Assume.assumeNoException("Docker environment not usable for Testcontainers", t);
        }
        container.start();
    }

    @AfterClass
    public static void stopServer() {
        container.stop();
    }
}
