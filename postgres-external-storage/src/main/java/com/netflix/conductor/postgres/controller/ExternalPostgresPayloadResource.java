package com.netflix.conductor.postgres.controller;

import java.io.InputStream;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.netflix.conductor.common.utils.ExternalPayloadStorage;

import io.swagger.v3.oas.annotations.Operation;

/**
 * REST controller for pulling payload stream of data by key (externalPayloadPath) from PostgreSQL
 * database
 */
@RestController
@RequestMapping(value = "/api/external/postgres")
@ConditionalOnProperty(name = "conductor.external-payload-storage.type", havingValue = "postgres")
public class ExternalPostgresPayloadResource {

    private final ExternalPayloadStorage postgresService;

    public ExternalPostgresPayloadResource(
            @Qualifier("postgresExternalPayloadStorage") ExternalPayloadStorage postgresService) {
        this.postgresService = postgresService;
    }

    @GetMapping("/{externalPayloadPath}")
    @Operation(
            summary =
                    "Get task or workflow by externalPayloadPath from External PostgreSQL Storage")
    public ResponseEntity<InputStreamResource> getExternalStorageData(
            @PathVariable("externalPayloadPath") String externalPayloadPath) {
        InputStream inputStream = postgresService.download(externalPayloadPath);
        InputStreamResource outputStreamBody = new InputStreamResource(inputStream);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(outputStreamBody);
    }
}
