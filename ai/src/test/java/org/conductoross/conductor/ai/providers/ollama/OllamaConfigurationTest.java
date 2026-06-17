package org.conductoross.conductor.ai.providers.ollama;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OllamaConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        OllamaConfiguration config = new OllamaConfiguration();
        assertEquals("http://localhost:11434", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        OllamaConfiguration config = new OllamaConfiguration();
        config.setBaseURL("http://remote-ollama:11434");
        assertEquals("http://remote-ollama:11434", config.getBaseURL());
    }

    @Test
    void testGetCreatesOllamaInstance() {
        OllamaConfiguration config = new OllamaConfiguration();

        Ollama result = config.get();

        assertNotNull(result);
        assertEquals("ollama", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        OllamaConfiguration config =
                new OllamaConfiguration(
                        "http://custom:11434", "Authorization", "Bearer token", null);

        assertEquals("http://custom:11434", config.getBaseURL());
        assertEquals("Authorization", config.getAuthHeaderName());
        assertEquals("Bearer token", config.getAuthHeader());
    }

    @Test
    void testNoArgsConstructor() {
        OllamaConfiguration config = new OllamaConfiguration();
        assertNull(config.getAuthHeaderName());
        assertNull(config.getAuthHeader());
    }
}
