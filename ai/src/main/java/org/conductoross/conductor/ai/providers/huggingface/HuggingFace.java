package org.conductoross.conductor.ai.providers.huggingface;

import java.util.List;

import org.conductoross.conductor.ai.AIModel;
import org.conductoross.conductor.ai.http.AIHttpClients;
import org.conductoross.conductor.ai.models.ChatCompletion;
import org.conductoross.conductor.ai.models.EmbeddingGenRequest;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.image.ImageModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

import okhttp3.OkHttpClient;

public class HuggingFace implements AIModel {

    public static final String NAME = "huggingface";
    private final HuggingFaceConfiguration config;
    private final OkHttpClient httpClient;

    public HuggingFace(HuggingFaceConfiguration config) {
        this(config, AIHttpClients.defaultClient());
    }

    public HuggingFace(HuggingFaceConfiguration config, OkHttpClient httpClient) {
        this.config = config;
        this.httpClient = httpClient;
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
        // HuggingFace has limited options support through generic interface
        return ToolCallingChatOptions.builder()
                .model(input.getModel())
                .temperature(input.getTemperature())
                .topP(input.getTopP())
                .maxTokens(input.getMaxTokens())
                .internalToolExecutionEnabled(false)
                .build();
    }

    @Override
    public ChatModel getChatModel() {
        HuggingFaceApi api =
                new HuggingFaceApi(httpClient, config.getApiKey(), config.getBaseURL());
        return new HuggingFaceChatModel(api);
    }

    @Override
    public ImageModel getImageModel() {
        throw new UnsupportedOperationException("Image generation not supported by the model yet");
    }
}
