package org.conductoross.conductor.ai.providers.huggingface;

import org.junit.jupiter.api.Test;

import okhttp3.OkHttpClient;

import static org.junit.jupiter.api.Assertions.*;

class HuggingFaceConfigurationTest {

    @Test
    void testDefaultBaseURL() {
        HuggingFaceConfiguration config = new HuggingFaceConfiguration();
        assertEquals("https://huggingface.co/api", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        HuggingFaceConfiguration config = new HuggingFaceConfiguration();
        config.setBaseURL("https://custom.huggingface.co");
        assertEquals("https://custom.huggingface.co", config.getBaseURL());
    }

    @Test
    void testGetCreatesHuggingFaceInstance() {
        HuggingFaceConfiguration config = new HuggingFaceConfiguration();
        config.setApiKey("test-key");

        HuggingFace result = new HuggingFace(config, new OkHttpClient());

        assertNotNull(result);
        assertEquals("huggingface", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        HuggingFaceConfiguration config =
                new HuggingFaceConfiguration("api-key", "https://custom.url", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.url", config.getBaseURL());
    }

    @Test
    void testNoArgsConstructor() {
        HuggingFaceConfiguration config = new HuggingFaceConfiguration();
        assertNull(config.getApiKey());
    }
}
