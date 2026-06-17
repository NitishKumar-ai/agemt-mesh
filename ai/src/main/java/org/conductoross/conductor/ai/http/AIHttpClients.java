package org.conductoross.conductor.ai.http;

import java.util.concurrent.TimeUnit;

import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;

/**
 * Single source of truth for building the AI {@link OkHttpClient}. Both the Spring-managed {@code
 * conductorAiHttpClient} bean and the fallbacks used when no client has been injected (tests,
 * manual instantiation) go through here so timeouts, connection pooling and retries stay
 * consistent.
 */
public final class AIHttpClients {

    private AIHttpClients() {}

    /** Builds an OkHttpClient configured from the given properties. */
    public static OkHttpClient build(AIHttpClientProperties props) {
        OkHttpClient.Builder builder =
                new OkHttpClient.Builder()
                        .connectTimeout(props.getConnectTimeout())
                        .readTimeout(props.getReadTimeout())
                        .writeTimeout(props.getWriteTimeout())
                        .connectionPool(
                                new ConnectionPool(
                                        props.getMaxIdleConnections(),
                                        props.getKeepAlive().toMillis(),
                                        TimeUnit.MILLISECONDS));

        if (props.getMaxRetries() > 0) {
            builder.addInterceptor(new RetryInterceptor(props.getMaxRetries()));
        }

        return builder.build();
    }

    /**
     * Builds an OkHttpClient using the default {@link AIHttpClientProperties} values. Used as a
     * fallback when no Spring-managed client has been injected, e.g. in tests or when a provider is
     * constructed directly. Note that clients created this way are not tied to the Spring lifecycle
     * and so are not shut down via {@code @PreDestroy}.
     */
    public static OkHttpClient defaultClient() {
        return build(new AIHttpClientProperties());
    }
}
