package org.conductoross.conductor.ai.providers.gemini;

import java.util.List;

import org.conductoross.conductor.ai.models.ToolSpec;
import org.springframework.ai.chat.prompt.ChatOptions;

import lombok.Builder;
import lombok.Data;

/**
 * Chat options for the Gemini API. Carries standard ChatOptions fields plus Gemini-specific fields
 * (tools, google search, code execution, thinking).
 */
@Data
@Builder
public class GeminiChatOptions implements ChatOptions {

    private String model;
    private Double temperature;
    private Double topP;
    private Integer topK;
    private Integer maxTokens;
    private List<String> stopSequences;
    private Double frequencyPenalty;
    private Double presencePenalty;

    // Gemini-specific
    private List<ToolSpec> tools;
    private boolean googleSearchRetrieval;
    private boolean codeExecution;
    private Integer thinkingBudgetTokens;
    // When true, the request asks Gemini to emit thought summaries on response
    // parts (each ``Part.thought() == true``). Without this, gemini-2.5 will
    // run reasoning under the hood but never return summary text. Driven by
    // ChatCompletion.reasoningSummary at the provider entry point.
    private Boolean includeThoughts;

    @Override
    public ChatOptions copy() {
        return GeminiChatOptions.builder()
                .model(model)
                .temperature(temperature)
                .topP(topP)
                .topK(topK)
                .maxTokens(maxTokens)
                .stopSequences(stopSequences)
                .frequencyPenalty(frequencyPenalty)
                .presencePenalty(presencePenalty)
                .tools(tools)
                .googleSearchRetrieval(googleSearchRetrieval)
                .codeExecution(codeExecution)
                .thinkingBudgetTokens(thinkingBudgetTokens)
                .includeThoughts(includeThoughts)
                .build();
    }
}
