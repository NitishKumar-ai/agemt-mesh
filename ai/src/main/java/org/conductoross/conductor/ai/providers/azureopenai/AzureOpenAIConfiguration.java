package org.conductoross.conductor.ai.providers.azureopenai;

import java.time.Duration;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;

@Data
@NoArgsConstructor
@ConfigurationProperties(prefix = "conductor.ai.azureopenai")
@Component(value = AzureOpenAI.NAME)
public class AzureOpenAIConfiguration implements ModelConfiguration<AzureOpenAI> {

    private String apiKey;
    private String baseURL;
    private String user;
    private String deploymentName;
    private Duration timeout = Duration.ofSeconds(600);

    private OkHttpClient httpClient;

    public AzureOpenAIConfiguration(
            String apiKey,
            String baseURL,
            String user,
            String deploymentName,
            OkHttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.user = user;
        this.deploymentName = deploymentName;
        this.httpClient = httpClient;
    }

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    public AzureOpenAI get() {
        return new AzureOpenAI(this, httpClient);
    }
}
