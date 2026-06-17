package org.conductoross.conductor.ai.providers.anthropic;

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
@ConfigurationProperties(prefix = "conductor.ai.anthropic")
@NoArgsConstructor
public class AnthropicConfiguration implements ModelConfiguration<Anthropic> {

    private String apiKey;

    private String baseURL;

    private String version;

    private String betaVersion;

    private String completionsPath;

    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public AnthropicConfiguration(
            String apiKey,
            String baseURL,
            String version,
            String betaVersion,
            String completionsPath,
            OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.version = version;
        this.betaVersion = betaVersion;
        this.completionsPath = completionsPath;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String getBaseURL() {
        return baseURL == null ? "https://api.anthropic.com" : baseURL;
    }

    @Override
    public Anthropic get() {
        return new Anthropic(this, httpClient);
    }
}
