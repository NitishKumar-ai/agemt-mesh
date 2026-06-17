package org.conductoross.conductor.ai.providers.openai;

import org.junit.jupiter.api.Test;

import okhttp3.OkHttpClient;

import static org.junit.jupiter.api.Assertions.*;

class OpenAIConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        OpenAIConfiguration config = new OpenAIConfiguration();
        assertEquals("https://api.openai.com/v1", config.getBaseURL());
    }

    @Test
    void testBlankBaseURLReturnsDefault() {
        OpenAIConfiguration config = new OpenAIConfiguration();
        config.setBaseURL("   ");
        assertEquals("https://api.openai.com/v1", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        OpenAIConfiguration config = new OpenAIConfiguration();
        config.setBaseURL("https://custom.openai.com/v1");
        assertEquals("https://custom.openai.com/v1", config.getBaseURL());
    }

    @Test
    void testGetCreatesOpenAIInstance() {
        OpenAIConfiguration config = new OpenAIConfiguration();
        config.setApiKey("test-key");

        OpenAI result = new OpenAI(config, new OkHttpClient());

        assertNotNull(result);
        assertEquals("openai", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        OpenAIConfiguration config =
                new OpenAIConfiguration("api-key", "https://custom.url", "org-id", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.url", config.getBaseURL());
        assertEquals("org-id", config.getOrganizationId());
    }

    @Test
    void testNoArgsConstructor() {
        OpenAIConfiguration config = new OpenAIConfiguration();
        assertNull(config.getApiKey());
        assertNull(config.getOrganizationId());
    }
}
