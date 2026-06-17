package org.conductoross.conductor.ai.providers.mistral;

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
@ConfigurationProperties(prefix = "conductor.ai.mistral")
@NoArgsConstructor
public class MistralAIConfiguration implements ModelConfiguration<MistralAI> {

    private String apiKey;

    private String baseURL;

    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public MistralAIConfiguration(String apiKey, String baseURL, OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String getBaseURL() {
        return baseURL == null ? "https://api.mistral.ai" : baseURL;
    }

    @Override
    public MistralAI get() {
        return httpClient != null ? new MistralAI(this, httpClient) : new MistralAI(this);
    }
}
