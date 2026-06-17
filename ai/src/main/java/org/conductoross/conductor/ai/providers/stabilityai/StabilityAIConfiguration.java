package org.conductoross.conductor.ai.providers.stabilityai;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;

/**
 * Configuration for the Stability AI image generation provider.
 *
 * <p>Activated by setting {@code conductor.ai.stabilityai.apiKey} in application properties. Uses
 * Spring AI's built-in {@code StabilityAiImageModel} for text-to-image generation with Stable
 * Diffusion models.
 */
@Data
@Component
@ConfigurationProperties(prefix = "conductor.ai.stabilityai")
@NoArgsConstructor
public class StabilityAIConfiguration implements ModelConfiguration<StabilityAI> {

    private String apiKey;

    private OkHttpClient httpClient;

    public StabilityAIConfiguration(String apiKey, OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public StabilityAI get() {
        return new StabilityAI(this, httpClient);
    }
}
