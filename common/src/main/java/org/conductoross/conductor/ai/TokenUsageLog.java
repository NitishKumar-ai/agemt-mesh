package org.conductoross.conductor.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.With;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@With
public class TokenUsageLog {
    private String integrationName;
    private String api;
    private long periodStart;
    private int promptTokens;
    private int completionTokens;
    private int totalTokens;
    private String taskId;
}
