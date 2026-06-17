package org.conductoross.conductor.ai.providers.perplexity;

import java.time.Duration;
import java.util.Objects;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;

@Data
@NoArgsConstructor
@Component
@ConfigurationProperties(prefix = "conductor.ai.perplexity")
public class PerplexityAIConfiguration implements ModelConfiguration<PerplexityAI> {
    private String apiKey;
    private String baseURL;
    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public PerplexityAIConfiguration(String apiKey, String baseURL, OkHttpClient httpClient) {
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
        return Objects.isNull(baseURL) ? "https://api.perplexity.ai/" : baseURL;
    }

    @Override
    public PerplexityAI get() {
        return new PerplexityAI(this, httpClient);
    }
}
