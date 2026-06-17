package org.conductoross.conductor.ai.providers.anthropic;

import java.util.List;

import org.conductoross.conductor.ai.providers.anthropic.api.AnthropicMessagesApi;
import org.springframework.ai.chat.prompt.ChatOptions;

import lombok.Builder;
import lombok.Data;

/**
 * Chat options for the Anthropic Messages API. Carries both standard ChatOptions fields and
 * Anthropic-specific fields (thinking, built-in tools, etc.).
 */
@Data
@Builder
public class AnthropicChatOptions implements ChatOptions {

    private String model;
    private Double temperature;
    private Double topP;
    private Integer topK;
    private Integer maxTokens;
    private List<String> stopSequences;

    // Anthropic-specific
    private Integer thinkingBudgetTokens;
    // One of "low", "medium", "high", "xhigh", "max". Serialized as
    // ``output_config.effort`` on the request. Required (alongside adaptive thinking) on
    // Opus 4.7, which rejects ``thinking.type.enabled``. Optional on older models.
    private String reasoningEffort;
    // Any non-blank value gates surfacing the model's thinking blocks into
    // ChatResponseMetadata["reasoning"]. The thinking budget itself is set
    // via ``thinkingBudgetTokens``; this flag only controls response-side
    // exposure so callers can opt in alongside OpenAI/Gemini parity.
    private String reasoningSummary;
    private List<AnthropicMessagesApi.Tool> tools;

    @Override
    public Double getFrequencyPenalty() {
        return null; // Not supported by Anthropic
    }

    @Override
    public Double getPresencePenalty() {
        return null; // Not supported by Anthropic
    }

    @Override
    public ChatOptions copy() {
        return AnthropicChatOptions.builder()
                .model(model)
                .temperature(temperature)
                .topP(topP)
                .topK(topK)
                .maxTokens(maxTokens)
                .stopSequences(stopSequences)
                .thinkingBudgetTokens(thinkingBudgetTokens)
                .reasoningEffort(reasoningEffort)
                .reasoningSummary(reasoningSummary)
                .tools(tools)
                .build();
    }
}
