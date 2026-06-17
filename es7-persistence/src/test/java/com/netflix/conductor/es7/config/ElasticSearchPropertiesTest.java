package com.netflix.conductor.es7.config;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
}
