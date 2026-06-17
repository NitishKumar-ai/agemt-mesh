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
public class ImageGenRequest extends LLMWorkerInput {
    public enum OutputFormat {
        jpg,
        png,
        webp
    }

    private float weight;
    @Builder.Default private int n = 1;
    private int width = 1024;
    private int height = 1024;
    private String size;
    private String style;
    @Builder.Default private OutputFormat outputFormat = OutputFormat.png;
}
