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
public class AudioGenRequest extends LLMWorkerInput {
    private String text;
    private String voice;
    @Builder.Default private double speed = 1.0;
    @Builder.Default private String responseFormat = "mp3";
    @Builder.Default private int n = 1;
}
