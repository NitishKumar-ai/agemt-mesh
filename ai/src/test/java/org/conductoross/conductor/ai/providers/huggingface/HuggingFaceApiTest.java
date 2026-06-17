package org.conductoross.conductor.ai.providers.huggingface;

import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import okhttp3.OkHttpClient;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

import static org.junit.jupiter.api.Assertions.*;

class HuggingFaceApiTest {

    private MockWebServer server;
    private HuggingFaceApi api;

    @BeforeEach
    void setUp() throws Exception {
        server = new MockWebServer();
        server.start();
        OkHttpClient client = new OkHttpClient.Builder().readTimeout(5, TimeUnit.SECONDS).build();
        api = new HuggingFaceApi(client, "test-token", server.url("/").toString());
    }

    @AfterEach
    void tearDown() throws Exception {
        server.shutdown();
    }

    @Test
    void generateCallsApiAndReturnsText() throws Exception {
        server.enqueue(
                new MockResponse()
                        .setResponseCode(200)
                        .setBody("[{\"generated_text\":\"Hello world\"}]")
                        .addHeader("Content-Type", "application/json"));

        String result = api.generate("Say hello");

        assertEquals("Hello world", result);
        RecordedRequest req = server.takeRequest();
        assertEquals("POST", req.getMethod());
        assertTrue(req.getBody().readUtf8().contains("Say hello"));
        assertEquals("Bearer test-token", req.getHeader("Authorization"));
    }

    @Test
    void throwsOnNon200() {
        server.enqueue(new MockResponse().setResponseCode(503).setBody("unavailable"));
        assertThrows(java.io.IOException.class, () -> api.generate("test"));
    }
}
