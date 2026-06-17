package org.conductoross.conductor.ai.providers.gemini;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GeminiVertexConfigurationTest {

    @Test
    void testDefaultBaseURL_withLocation() {
        GeminiVertexConfiguration config = new GeminiVertexConfiguration();
        config.setLocation("us-central1");
        assertEquals("us-central1-aiplatform.googleapis.com:443", config.getBaseURL());
    }

    @Test
    void testCustomBaseURL() {
        GeminiVertexConfiguration config = new GeminiVertexConfiguration();
        config.setBaseURL("https://custom.googleapis.com");
        assertEquals("https://custom.googleapis.com", config.getBaseURL());
    }

    @Test
    void testGetCreatesGeminiVertexInstance() {
        GeminiVertexConfiguration config = new GeminiVertexConfiguration();
        config.setProjectId("my-project");
        config.setLocation("us-central1");

        GeminiVertex result = config.get();

        assertNotNull(result);
        assertEquals("vertex_ai", result.getModelProvider());
    }

    @Test
    void testNoArgsConstructor() {
        GeminiVertexConfiguration config = new GeminiVertexConfiguration();
        assertNull(config.getProjectId());
        assertNull(config.getLocation());
        assertNull(config.getPublisher());
        assertNull(config.getGoogleCredentials());
    }

    @Test
    void testDefaultBaseURL_nullLocationReturnsNullPrefix() {
        GeminiVertexConfiguration config = new GeminiVertexConfiguration();
        // With null location, baseURL is constructed with null prefix
        assertEquals("null-aiplatform.googleapis.com:443", config.getBaseURL());
    }
}
