package org.conductoross.conductor.ai.providers.openai;

import java.util.List;

import org.conductoross.conductor.ai.providers.openai.api.OpenAIResponsesApi;
import org.springframework.ai.chat.prompt.ChatOptions;

import lombok.Builder;
import lombok.Data;

/**
 * Chat options for the OpenAI Responses API. Carries both standard ChatOptions fields and
 * Responses-API-specific fields (previousResponseId, reasoningEffort, built-in tools, etc.) through
 * Spring AI's ChatOptions interface.
 */
@Data
@Builder
public class OpenAIResponsesChatOptions implements ChatOptions {

    private String model;
    private Double temperature;
    private Double topP;
    private Integer maxTokens;
    private Double frequencyPenalty;
    private Double presencePenalty;
    private List<String> stopSequences;

    // Responses API specific
    private String previousResponseId;
    private String reasoningEffort;
    private String reasoningSummary;
    private Boolean jsonOutput;
    private List<OpenAIResponsesApi.Tool> responsesApiTools;

    @Override
    public Integer getTopK() {
        return null; // Not supported by OpenAI
    }

    @Override
    public ChatOptions copy() {
        return OpenAIResponsesChatOptions.builder()
                .model(model)
                .temperature(temperature)
                .topP(topP)
                .maxTokens(maxTokens)
                .frequencyPenalty(frequencyPenalty)
                .presencePenalty(presencePenalty)
                .stopSequences(stopSequences)
                .previousResponseId(previousResponseId)
                .reasoningEffort(reasoningEffort)
                .reasoningSummary(reasoningSummary)
                .jsonOutput(jsonOutput)
                .responsesApiTools(responsesApiTools)
                .build();
    }
}
