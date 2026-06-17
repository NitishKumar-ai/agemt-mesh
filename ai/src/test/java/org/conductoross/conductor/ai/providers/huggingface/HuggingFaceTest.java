package org.conductoross.conductor.ai.providers.huggingface;

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

class HuggingFaceTest {

    private static final String ENV_API_KEY = "HUGGINGFACE_API_KEY";

    @Nested
    class UnitTests {

        private HuggingFace huggingFace;

        @BeforeEach
        void setUp() {
            HuggingFaceConfiguration config = new HuggingFaceConfiguration();
            config.setApiKey("test-api-key");
            huggingFace = new HuggingFace(config, new OkHttpClient());
        }

        @Test
        void testGetModelProvider() {
            assertEquals("huggingface", huggingFace.getModelProvider());
        }

        @Test
        void testGenerateEmbeddings_throwsUnsupportedException() {
            assertThrows(
                    UnsupportedOperationException.class,
                    () -> huggingFace.generateEmbeddings(null));
        }

        @Test
        void testGetImageModel_throwsUnsupportedException() {
            assertThrows(UnsupportedOperationException.class, () -> huggingFace.getImageModel());
        }

        @Test
        void testGetChatOptions_basicOptions() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("meta-llama/Meta-Llama-3-8B-Instruct");
            input.setMaxTokens(1000);
            input.setTemperature(0.7);

            var options = huggingFace.getChatOptions(input);

            assertNotNull(options);
        }

        @Test
        void testGetChatModel_createsModel() {
            var chatModel = huggingFace.getChatModel();
            assertNotNull(chatModel);
        }
    }

    @Nested
    @EnabledIfEnvironmentVariable(named = ENV_API_KEY, matches = ".+")
    class IntegrationTests {

        private HuggingFace huggingFace;

        @BeforeEach
        void setUp() {
            HuggingFaceConfiguration config = new HuggingFaceConfiguration();
            config.setApiKey(System.getenv(ENV_API_KEY));
            huggingFace = new HuggingFace(config, new OkHttpClient());
        }

        @Test
        void testChatCompletion() {
            ChatCompletion input = new ChatCompletion();
            input.setModel("meta-llama/Meta-Llama-3-8B-Instruct");
            input.setMaxTokens(100);
            input.setTemperature(0.7);

            var chatModel = huggingFace.getChatModel();
            var options = huggingFace.getChatOptions(input);

            Prompt prompt = new Prompt(List.of(new UserMessage("Say hello in one word")), options);
            var response = chatModel.call(prompt);

            assertNotNull(response);
            assertNotNull(response.getResult());
            assertNotNull(response.getResult().getOutput());
            assertFalse(response.getResult().getOutput().getText().isEmpty());
        }
    }
}
