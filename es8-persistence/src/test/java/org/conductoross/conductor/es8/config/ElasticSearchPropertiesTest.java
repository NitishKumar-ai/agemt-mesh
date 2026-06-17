package org.conductoross.conductor.es8.config;

import java.util.List;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ElasticSearchPropertiesTest {

    @Test
    public void testWaitForIndexRefreshDefaultsToFalse() {
        ElasticSearchProperties properties = new ElasticSearchProperties();
        assertFalse(
                "waitForIndexRefresh should default to false for v3.21.19 performance",
                properties.isWaitForIndexRefresh());
    }

    @Test
    public void testWaitForIndexRefreshCanBeEnabled() {
        ElasticSearchProperties properties = new ElasticSearchProperties();
        properties.setWaitForIndexRefresh(true);
        assertTrue(
                "waitForIndexRefresh should be configurable to true",
                properties.isWaitForIndexRefresh());
    }

    @Test
    public void testDefaultUrlUsesHttpPort9200() {
        ElasticSearchProperties properties = new ElasticSearchProperties();
        assertEquals("localhost:9200", properties.getUrl());
    }

    @Test
    public void testToUrlsTrimsAndAppliesDefaultHttpScheme() {
        ElasticSearchProperties properties = new ElasticSearchProperties();
        properties.setUrl(" https://es1:9243 , es2:9200 ");

        List<java.net.URL> urls = properties.toURLs();
        assertEquals(2, urls.size());
        assertEquals("https", urls.get(0).getProtocol());
        assertEquals("es1", urls.get(0).getHost());
        assertEquals(9243, urls.get(0).getPort());
        assertEquals("http", urls.get(1).getProtocol());
        assertEquals("es2", urls.get(1).getHost());
        assertEquals(9200, urls.get(1).getPort());
    }

    @Test
    public void testToUrlsRejectsBlankConfiguration() {
        ElasticSearchProperties properties = new ElasticSearchProperties();
        properties.setUrl(" , ");

        try {
            properties.toURLs();
            fail("Expected IllegalArgumentException for blank url configuration");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("conductor.elasticsearch.url"));
        }
    }
}
