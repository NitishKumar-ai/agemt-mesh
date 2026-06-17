package org.conductoross.conductor.ai.providers.cohere;

import java.util.List;

import org.conductoross.conductor.ai.models.ChatCompletion;
import org.conductoross.conductor.ai.models.EmbeddingGenRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;

import static org.junit.jupiter.api.Assertions.*;

class CohereAITest {

    private static final String ENV_API_KEY = "COHERE_API_KEY";

    @Nested
    class UnitTests {

        private CohereAI cohereAI;

        @BeforeEach
        void setUp() {
            CohereAIConfiguration config = new CohereAIConfiguration();
            config.setApiKey("test-api-key");
            cohereAI = new CohereAI(config);
        }

        @Test
        void testGetModelProvider() {
            assertEquals("cohere", cohereAI.getModelProvider());
        }

        @Test
        void testGetImageModel_throwsUnsupportedException() {
            assertThrows(UnsupportedOperationException.class, () -> cohereAI.getImageModel());
        }

        @Test
        void testGetChatOptions_basicOptions() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("command-a-03-2025");
            input.setMaxTokens(1000);
            input.setTemperature(0.7);

            var options = cohereAI.getChatOptions(input);

            assertNotNull(options);
        }

        @Test
        void testGetChatModel_createsModel() {
            var chatModel = cohereAI.getChatModel();
            assertNotNull(chatModel);
        }
    }

    @Nested
    @EnabledIfEnvironmentVariable(named = ENV_API_KEY, matches = ".+")
    class IntegrationTests {

        private CohereAI cohereAI;

        @BeforeEach
        void setUp() {
            CohereAIConfiguration config = new CohereAIConfiguration();
            config.setApiKey(System.getenv(ENV_API_KEY));
            cohereAI = new CohereAI(config);
        }

        @Test
        void testChatCompletion() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("command-a-03-2025");
            input.setMaxTokens(100);
            input.setTemperature(0.7);

            var chatModel = cohereAI.getChatModel();
            var options = cohereAI.getChatOptions(input);

            Prompt prompt = new Prompt(List.of(new UserMessage("Say hello in one word")), options);
            var response = chatModel.call(prompt);

            assertNotNull(response);
            assertNotNull(response.getResult());
            assertNotNull(response.getResult().getOutput());
            assertFalse(response.getResult().getOutput().getText().isEmpty());
        }

        @Test
        void testEmbeddings() {
            EmbeddingGenRequest request = new EmbeddingGenRequest();
            request.setModel("embed-english-v3.0");
            request.setText("Hello world");

            var embeddings = cohereAI.generateEmbeddings(request);

            assertNotNull(embeddings);
            assertFalse(embeddings.isEmpty());
        }
    }
}
