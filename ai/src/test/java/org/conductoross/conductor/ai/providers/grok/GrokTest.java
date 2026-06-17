package org.conductoross.conductor.ai.providers.grok;

import java.util.List;

import org.conductoross.conductor.ai.models.ChatCompletion;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;

import okhttp3.OkHttpClient;

import static org.junit.jupiter.api.Assertions.*;

class GrokTest {

    private static final String ENV_API_KEY = "GROK_API_KEY";

    @Nested
    class UnitTests {

        private Grok grok;

        @BeforeEach
        void setUp() {
            GrokAIConfiguration config = new GrokAIConfiguration();
            config.setApiKey("test-api-key");
            grok = new Grok(config, new OkHttpClient());
        }

        @Test
        void testGetModelProvider() {
            assertEquals("Grok", grok.getModelProvider());
        }

        @Test
        void testGenerateEmbeddings_throwsUnsupportedException() {
            assertThrows(UnsupportedOperationException.class, () -> grok.generateEmbeddings(null));
        }

        @Test
        void testGetImageModel_throwsUnsupportedException() {
            assertThrows(UnsupportedOperationException.class, () -> grok.getImageModel());
        }

        @Test
        void testGetChatOptions_basicOptions() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("grok-3-mini");
            input.setMaxTokens(1000);
            input.setTemperature(0.7);

            var options = grok.getChatOptions(input);

            assertNotNull(options);
        }

        @Test
        void testGetChatModel_createsModel() {
            var chatModel = grok.getChatModel();
            assertNotNull(chatModel);
        }
    }

    @Nested
    @EnabledIfEnvironmentVariable(named = ENV_API_KEY, matches = ".+")
    class IntegrationTests {

        private Grok grok;

        @BeforeEach
        void setUp() {
            GrokAIConfiguration config = new GrokAIConfiguration();
            config.setApiKey(System.getenv(ENV_API_KEY));
            grok = new Grok(config, new OkHttpClient());
        }

        @Test
        void testChatCompletion() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("grok-3-mini");
            input.setMaxTokens(100);
            input.setTemperature(0.7);

            var chatModel = grok.getChatModel();
            var options = grok.getChatOptions(input);

            Prompt prompt = new Prompt(List.of(new UserMessage("Say hello in one word")), options);
            var response = chatModel.call(prompt);

            assertNotNull(response);
            assertNotNull(response.getResult());
            assertNotNull(response.getResult().getOutput());
            assertFalse(response.getResult().getOutput().getText().isEmpty());
        }
    }
}
