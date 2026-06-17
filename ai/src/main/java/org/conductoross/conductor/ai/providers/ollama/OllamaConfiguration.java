package org.conductoross.conductor.ai.providers.ollama;

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
@ConfigurationProperties(prefix = "conductor.ai.ollama")
@NoArgsConstructor
public class OllamaConfiguration implements ModelConfiguration<Ollama> {

    private String baseURL;

    private String authHeaderName;

    private String authHeader;

    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public OllamaConfiguration(
            String baseURL, String authHeaderName, String authHeader, OkHttpClient httpClient) {
        this.baseURL = baseURL;
        this.authHeaderName = authHeaderName;
        this.authHeader = authHeader;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String getBaseURL() {
        return baseURL == null ? "http://localhost:11434" : baseURL;
    }

    @Override
    public Ollama get() {
        return httpClient != null ? new Ollama(this, httpClient) : new Ollama(this);
    }
}
