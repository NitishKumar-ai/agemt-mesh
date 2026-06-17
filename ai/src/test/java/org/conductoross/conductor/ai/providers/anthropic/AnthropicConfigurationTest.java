package org.conductoross.conductor.ai.providers.anthropic;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AnthropicConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        AnthropicConfiguration config = new AnthropicConfiguration();
        assertEquals("https://api.anthropic.com", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        AnthropicConfiguration config = new AnthropicConfiguration();
        config.setBaseURL("https://custom.anthropic.com");
        assertEquals("https://custom.anthropic.com", config.getBaseURL());
    }

    @Test
    void testGetCreatesAnthropicInstance() {
        AnthropicConfiguration config = new AnthropicConfiguration();
        config.setApiKey("test-key");

        Anthropic result = config.get();

        assertNotNull(result);
        assertEquals("anthropic", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        AnthropicConfiguration config =
                new AnthropicConfiguration(
                        "api-key", "https://custom.url", "v1", "beta", "/completions", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.url", config.getBaseURL());
        assertEquals("v1", config.getVersion());
        assertEquals("beta", config.getBetaVersion());
        assertEquals("/completions", config.getCompletionsPath());
    }

    @Test
    void testNoArgsConstructor() {
        AnthropicConfiguration config = new AnthropicConfiguration();
        assertNull(config.getApiKey());
        assertNull(config.getVersion());
        assertNull(config.getBetaVersion());
        assertNull(config.getCompletionsPath());
    }
}
