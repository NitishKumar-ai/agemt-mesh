package org.conductoross.conductor.ai.providers.perplexity;

import java.util.List;

import org.conductoross.conductor.ai.AIModel;
import org.conductoross.conductor.ai.http.AIHttpClients;
import org.conductoross.conductor.ai.models.ChatCompletion;
import org.conductoross.conductor.ai.models.EmbeddingGenRequest;
import org.conductoross.conductor.ai.providers.openai.OpenAICompatChatModel;
import org.conductoross.conductor.ai.providers.openai.api.OpenAIChatCompletionsApi;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.image.ImageModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

import okhttp3.OkHttpClient;

public class PerplexityAI implements AIModel {

    public static final String NAME = "perplexity";
    private final PerplexityAIConfiguration config;
    private final OpenAICompatChatModel chatModel;

    public PerplexityAI(PerplexityAIConfiguration config) {
        this(config, AIHttpClients.defaultClient());
    }

    public PerplexityAI(PerplexityAIConfiguration config, OkHttpClient httpClient) {
        this.config = config;
        OpenAIChatCompletionsApi api =
                new OpenAIChatCompletionsApi(
                        httpClient, config.getApiKey(), config.getBaseURL(), "/chat/completions");
        this.chatModel = new OpenAICompatChatModel(api);
    }

    @Override
    public String getModelProvider() {
        return NAME;
    }

    @Override
    public List<Float> generateEmbeddings(EmbeddingGenRequest embeddingGenRequest) {
        throw new UnsupportedOperationException("Not supported");
    }

    @Override
    public ChatOptions getChatOptions(ChatCompletion input) {
        return ToolCallingChatOptions.builder()
                .model(input.getModel())
                .maxTokens(input.getMaxTokens())
                .topP(input.getTopP())
                .temperature(input.getTemperature())
                .toolCallbacks(getToolCallback(input))
                .internalToolExecutionEnabled(false)
                .frequencyPenalty(input.getFrequencyPenalty())
                .topK(input.getTopK())
                .presencePenalty(input.getPresencePenalty())
                .build();
    }

    @Override
    public ChatModel getChatModel() {
        return this.chatModel;
    }

    @Override
    public ImageModel getImageModel() {
        throw new UnsupportedOperationException("Image generation not supported by the model yet");
    }
}
