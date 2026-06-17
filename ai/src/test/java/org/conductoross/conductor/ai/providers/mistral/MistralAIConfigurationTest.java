package org.conductoross.conductor.ai.providers.mistral;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MistralAIConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        MistralAIConfiguration config = new MistralAIConfiguration();
        assertEquals("https://api.mistral.ai", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        MistralAIConfiguration config = new MistralAIConfiguration();
        config.setBaseURL("https://custom.mistral.ai");
        assertEquals("https://custom.mistral.ai", config.getBaseURL());
    }

    @Test
    void testGetCreatesMistralAIInstance() {
        MistralAIConfiguration config = new MistralAIConfiguration();
        config.setApiKey("test-key");

        MistralAI result = config.get();

        assertNotNull(result);
        assertEquals("mistral", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        MistralAIConfiguration config =
                new MistralAIConfiguration("api-key", "https://custom.url", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.url", config.getBaseURL());
    }

    @Test
    void testNoArgsConstructor() {
        MistralAIConfiguration config = new MistralAIConfiguration();
        assertNull(config.getApiKey());
    }
}
