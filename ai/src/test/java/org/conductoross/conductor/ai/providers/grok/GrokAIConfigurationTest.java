package org.conductoross.conductor.ai.providers.grok;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GrokAIConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        GrokAIConfiguration config = new GrokAIConfiguration();
        assertEquals("https://api.x.ai", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        GrokAIConfiguration config = new GrokAIConfiguration();
        config.setBaseURL("https://custom.x.ai");
        assertEquals("https://custom.x.ai", config.getBaseURL());
    }

    @Test
    void testGetCreatesGrokInstance() {
        GrokAIConfiguration config = new GrokAIConfiguration();
        config.setApiKey("test-key");

        Grok result = config.get();

        assertNotNull(result);
        assertEquals("Grok", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        GrokAIConfiguration config =
                new GrokAIConfiguration("api-key", "https://custom.x.ai", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.x.ai", config.getBaseURL());
    }

    @Test
    void testNoArgsConstructor() {
        GrokAIConfiguration config = new GrokAIConfiguration();
        assertNull(config.getApiKey());
    }
}
