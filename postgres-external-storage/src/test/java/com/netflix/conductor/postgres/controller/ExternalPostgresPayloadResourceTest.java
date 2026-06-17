package com.netflix.conductor.postgres.controller;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.Before;
import org.junit.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ResponseEntity;

import com.netflix.conductor.postgres.storage.PostgresPayloadStorage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class ExternalPostgresPayloadResourceTest {

    private PostgresPayloadStorage mockPayloadStorage;
    private ExternalPostgresPayloadResource postgresResource;

    @Before
    public void before() {
        this.mockPayloadStorage = mock(PostgresPayloadStorage.class);
        this.postgresResource = new ExternalPostgresPayloadResource(this.mockPayloadStorage);
    }

    @Test
    public void testGetExternalStorageData() throws IOException {
        String data = "Dummy data";
        InputStream inputStreamData =
                new ByteArrayInputStream(data.getBytes(StandardCharsets.UTF_8));
        when(mockPayloadStorage.download(anyString())).thenReturn(inputStreamData);
        ResponseEntity<InputStreamResource> response =
                postgresResource.getExternalStorageData("dummyKey.json");
        assertNotNull(response.getBody());
        assertEquals(
                data,
                new String(
                        response.getBody().getInputStream().readAllBytes(),
                        StandardCharsets.UTF_8));
    }
}
