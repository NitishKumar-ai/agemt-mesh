package com.netflix.conductor.rest.controllers;

import java.util.Collections;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.netflix.runtime.health.api.HealthCheckStatus;

@RestController
@RequestMapping("/health")
public class HealthCheckResource {

    // SBMTODO: Move this Spring boot health check
    @GetMapping
    public HealthCheckStatus doCheck() throws Exception {
        return HealthCheckStatus.create(true, Collections.emptyList());
    }
}
