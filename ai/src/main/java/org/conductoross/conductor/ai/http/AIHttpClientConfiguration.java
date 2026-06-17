package org.conductoross.conductor.ai.http;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PreDestroy;
import okhttp3.OkHttpClient;

@Configuration
public class AIHttpClientConfiguration {

    private OkHttpClient client;

    @Bean
    public OkHttpClient conductorAiHttpClient(AIHttpClientProperties props) {
        client = AIHttpClients.build(props);
        return client;
    }

    @PreDestroy
    public void shutdown() {
        if (client != null) {
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
        }
    }
}
