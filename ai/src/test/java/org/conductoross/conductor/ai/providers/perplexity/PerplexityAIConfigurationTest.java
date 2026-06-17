package org.conductoross.conductor.ai.providers.perplexity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PerplexityAIConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        PerplexityAIConfiguration config = new PerplexityAIConfiguration();
        assertEquals("https://api.perplexity.ai/", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        PerplexityAIConfiguration config = new PerplexityAIConfiguration();
        config.setBaseURL("https://custom.perplexity.ai");
        assertEquals("https://custom.perplexity.ai", config.getBaseURL());
    }

    @Test
    void testGetCreatesPerplexityAIInstance() {
        PerplexityAIConfiguration config = new PerplexityAIConfiguration();
        config.setApiKey("test-key");

        PerplexityAI result = config.get();

        assertNotNull(result);
        assertEquals("perplexity", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        PerplexityAIConfiguration config =
                new PerplexityAIConfiguration("api-key", "https://custom.perplexity.ai", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.perplexity.ai", config.getBaseURL());
    }

    @Test
    void testNoArgsConstructor() {
        PerplexityAIConfiguration config = new PerplexityAIConfiguration();
        assertNull(config.getApiKey());
    }
}
