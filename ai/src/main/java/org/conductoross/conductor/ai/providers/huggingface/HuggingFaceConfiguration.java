package org.conductoross.conductor.ai.providers.huggingface;

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
@ConfigurationProperties(prefix = "conductor.ai.huggingface")
public class HuggingFaceConfiguration implements ModelConfiguration<HuggingFace> {

    private String apiKey;

    private String baseURL;

    private OkHttpClient httpClient;

    public HuggingFaceConfiguration(String apiKey, String baseURL, OkHttpClient httpClient) {
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
        return baseURL == null ? "https://huggingface.co/api" : baseURL; // changethis
    }

    @Override
    public HuggingFace get() {
        return new HuggingFace(this, httpClient);
    }
}
