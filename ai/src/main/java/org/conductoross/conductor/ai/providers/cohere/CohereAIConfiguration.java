package org.conductoross.conductor.ai.providers.cohere;

import java.time.Duration;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;

@Data
@Component
@ConfigurationProperties(prefix = "conductor.ai.cohere")
@NoArgsConstructor
@Slf4j
public class CohereAIConfiguration implements ModelConfiguration<CohereAI> {

    private String apiKey;
    private String baseURL = "https://api.cohere.ai";
    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public CohereAIConfiguration(String apiKey, String baseURL, OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public CohereAI get() {
        return httpClient != null ? new CohereAI(this, httpClient) : new CohereAI(this);
    }
}
