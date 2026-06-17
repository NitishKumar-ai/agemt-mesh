package org.conductoross.conductor.ai.providers.cohere;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CohereAIConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        CohereAIConfiguration config = new CohereAIConfiguration();
        assertEquals("https://api.cohere.ai", config.getBaseURL());
    }

    @Test
    void testGetCreatesCohereAIInstance() {
        CohereAIConfiguration config = new CohereAIConfiguration();
        config.setApiKey("test-key");

        CohereAI result = config.get();

        assertNotNull(result);
        assertEquals("cohere", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        CohereAIConfiguration config =
                new CohereAIConfiguration("api-key", "https://custom.cohere.ai", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.cohere.ai", config.getBaseURL());
    }

    @Test
    void testNoArgsConstructor() {
        CohereAIConfiguration config = new CohereAIConfiguration();
        assertNull(config.getApiKey());
    }
}
