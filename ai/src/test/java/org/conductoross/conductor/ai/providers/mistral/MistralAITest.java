package org.conductoross.conductor.ai.providers.mistral;

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

class MistralAITest {

    private static final String ENV_API_KEY = "MISTRAL_API_KEY";

    @Nested
    class UnitTests {

        private MistralAI mistralAI;

        @BeforeEach
        void setUp() {
            MistralAIConfiguration config = new MistralAIConfiguration();
            config.setApiKey("test-api-key");
            mistralAI = new MistralAI(config);
        }

        @Test
        void testGetModelProvider() {
            assertEquals("mistral", mistralAI.getModelProvider());
        }

        @Test
        void testGetImageModel_throwsUnsupportedException() {
            assertThrows(UnsupportedOperationException.class, () -> mistralAI.getImageModel());
        }

        @Test
        void testGetChatOptions_basicOptions() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("mistral-small-latest");
            input.setMaxTokens(1000);
            input.setTemperature(0.7);
            input.setTopP(0.9);

            var options = mistralAI.getChatOptions(input);

            assertNotNull(options);
        }

        @Test
        void testGetChatModel_createsModel() {
            var chatModel = mistralAI.getChatModel();
            assertNotNull(chatModel);
        }
    }

    @Nested
    @EnabledIfEnvironmentVariable(named = ENV_API_KEY, matches = ".+")
    class IntegrationTests {

        private MistralAI mistralAI;

        @BeforeEach
        void setUp() {
            MistralAIConfiguration config = new MistralAIConfiguration();
            config.setApiKey(System.getenv(ENV_API_KEY));
            mistralAI = new MistralAI(config);
        }

        @Test
        void testChatCompletion() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("mistral-small-latest");
            input.setMaxTokens(100);
            input.setTemperature(0.7);

            var chatModel = mistralAI.getChatModel();
            var options = mistralAI.getChatOptions(input);

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
            request.setModel("mistral-embed");
            request.setText("Hello world");

            var embeddings = mistralAI.generateEmbeddings(request);

            assertNotNull(embeddings);
            assertFalse(embeddings.isEmpty());
        }
    }
}
