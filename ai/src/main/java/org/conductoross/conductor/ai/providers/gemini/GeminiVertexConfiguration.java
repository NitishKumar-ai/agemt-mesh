package org.conductoross.conductor.ai.providers.gemini;

import org.conductoross.conductor.ai.ModelConfiguration;
import org.conductoross.conductor.ai.http.AIHttpClients;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import com.google.auth.oauth2.GoogleCredentials;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import okhttp3.OkHttpClient;

@Data
@Component
@ConfigurationProperties(prefix = "conductor.ai.gemini")
@AllArgsConstructor
@NoArgsConstructor
public class GeminiVertexConfiguration implements ModelConfiguration<GeminiVertex> {

    private String projectId;
    private String location;
    private String baseURL;
    private String publisher;
    private String apiKey;
    GoogleCredentials googleCredentials;

    private OkHttpClient httpClient;

    @Autowired
    @Override
    public void setHttpClient(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String getBaseURL() {
        return baseURL == null
                ? String.format("%s-aiplatform.googleapis.com:443", location)
                : baseURL;
    }

    /**
     * Returns the raw configured baseURL without applying the Vertex AI default. Use this when the
     * default would be incorrect (e.g. API key / AI Studio mode).
     */
    public String getRawBaseURL() {
        return baseURL;
    }

    @Override
    public GeminiVertex get() {
        OkHttpClient client = httpClient != null ? httpClient : AIHttpClients.defaultClient();
        return new GeminiVertex(this, client);
    }
}
