package org.conductoross.conductor.ai.providers.azureopenai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AzureOpenAIConfigurationTest {

    @Test
    void testGetCreatesAzureOpenAIInstance() {
        AzureOpenAIConfiguration config = new AzureOpenAIConfiguration();
        config.setApiKey("test-key");
        config.setBaseURL("https://myresource.openai.azure.com");
        config.setDeploymentName("gpt-4");

        AzureOpenAI result = config.get();

        assertNotNull(result);
        assertEquals("azure_openai", result.getModelProvider());
    }

    @Test
    void testAllArgsConstructor() {
        AzureOpenAIConfiguration config =
                new AzureOpenAIConfiguration(
                        "api-key", "https://custom.url", "user-1", "gpt-4", null);

        assertEquals("api-key", config.getApiKey());
        assertEquals("https://custom.url", config.getBaseURL());
        assertEquals("user-1", config.getUser());
        assertEquals("gpt-4", config.getDeploymentName());
    }

    @Test
    void testNoArgsConstructor() {
        AzureOpenAIConfiguration config = new AzureOpenAIConfiguration();
        assertNull(config.getApiKey());
        assertNull(config.getBaseURL());
        assertNull(config.getUser());
        assertNull(config.getDeploymentName());
    }
}
