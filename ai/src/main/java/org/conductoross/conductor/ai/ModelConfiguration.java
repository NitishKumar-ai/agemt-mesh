package org.conductoross.conductor.ai;

import okhttp3.OkHttpClient;

/**
 * Configuration for an {@link AIModel}. Implementations build the model via {@link #get()} and
 * receive the shared {@link OkHttpClient} (typically Spring's {@code conductorAiHttpClient}) via
 * {@link #setHttpClient(OkHttpClient)}. Providers that do not use OkHttp (e.g. Bedrock) may
 * implement {@link #setHttpClient(OkHttpClient)} as a no-op.
 */
public interface ModelConfiguration<T extends AIModel> {
    T get();

    void setHttpClient(OkHttpClient httpClient);
}
