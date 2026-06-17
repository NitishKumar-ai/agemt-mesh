package org.conductoross.conductor.ai.providers.grok;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

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
import org.springframework.ai.tool.ToolCallback;

import okhttp3.OkHttpClient;

public class Grok implements AIModel {

    public static final String NAME = "Grok";
    private final GrokAIConfiguration config;
    private final OpenAICompatChatModel chatModel;

    public Grok(GrokAIConfiguration config) {
        this(config, AIHttpClients.defaultClient());
    }

    public Grok(GrokAIConfiguration config, OkHttpClient httpClient) {
        this.config = config;
        OpenAIChatCompletionsApi api =
                new OpenAIChatCompletionsApi(
                        httpClient,
                        config.getApiKey(),
                        config.getBaseURL(),
                        "/v1/chat/completions");
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
        List<ToolCallback> toolCallbacks = getToolCallback(input);
        Set<String> toolNames =
                toolCallbacks.stream()
                        .map(tc -> tc.getToolDefinition().name())
                        .collect(Collectors.toSet());

        return ToolCallingChatOptions.builder()
                .model(input.getModel())
                .temperature(input.getTemperature())
                .topP(input.getTopP())
                .maxTokens(input.getMaxTokens())
                .stopSequences(input.getStopWords())
                .frequencyPenalty(input.getFrequencyPenalty())
                .presencePenalty(input.getPresencePenalty())
                .toolCallbacks(toolCallbacks)
                .toolNames(toolNames)
                .internalToolExecutionEnabled(false)
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
