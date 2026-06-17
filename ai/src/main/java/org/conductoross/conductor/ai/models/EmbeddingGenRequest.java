package org.conductoross.conductor.ai.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@EqualsAndHashCode(callSuper = true)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmbeddingGenRequest extends LLMWorkerInput {
    private String text;
    private Integer dimensions;
    private String model;
}
