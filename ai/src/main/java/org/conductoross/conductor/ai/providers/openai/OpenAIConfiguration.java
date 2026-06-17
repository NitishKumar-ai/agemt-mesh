package org.conductoross.conductor.ai.providers.openai;

import java.time.Duration;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;

@Data
@Component
@ConfigurationProperties(prefix = "conductor.ai.openai")
@NoArgsConstructor
public class OpenAIConfiguration implements ModelConfiguration<OpenAI> {

    private String apiKey;

    private String baseURL;

    private String organizationId;

    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public OpenAIConfiguration(
            String apiKey, String baseURL, String organizationId, OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.organizationId = organizationId;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String getBaseURL() {
        return baseURL == null || baseURL.isBlank() ? "https://api.openai.com/v1" : baseURL;
    }

    @Override
    public OpenAI get() {
        return new OpenAI(this, httpClient);
    }
}
