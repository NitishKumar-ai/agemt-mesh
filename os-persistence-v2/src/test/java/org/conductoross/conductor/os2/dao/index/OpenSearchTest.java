package org.conductoross.conductor.os2.dao.index;

import org.conductoross.conductor.os2.config.OpenSearchProperties;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.runner.RunWith;
import org.opensearch.testcontainers.OpensearchContainer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;
import org.testcontainers.utility.DockerImageName;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;

import com.fasterxml.jackson.databind.ObjectMapper;

@ContextConfiguration(
        classes = {TestObjectMapperConfiguration.class, OpenSearchTest.TestConfiguration.class})
@RunWith(SpringRunner.class)
@TestPropertySource(
        properties = {
            "conductor.indexing.enabled=true",
            "conductor.indexing.type=opensearch2",
            // Disable ES7 auto-configuration
            "conductor.elasticsearch.version=0",
            // Use new OpenSearch namespace
            "conductor.opensearch.version=2"
        })
public abstract class OpenSearchTest {

    @Configuration
    static class TestConfiguration {

        @Bean
        public OpenSearchProperties openSearchProperties() {
            return new OpenSearchProperties();
        }
    }

    protected static OpensearchContainer<?> container =
            new OpensearchContainer<>(
                    DockerImageName.parse(
                            "opensearchproject/opensearch:2.18.0")); // this should match the client
    // version

    @Autowired protected ObjectMapper objectMapper;

    @Autowired protected OpenSearchProperties properties;

    @BeforeClass
    public static void startServer() {
        container.start();
    }

    @AfterClass
    public static void stopServer() {
        container.stop();
    }
}
