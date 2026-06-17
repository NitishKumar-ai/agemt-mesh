package com.netflix.conductor.service;

import org.springframework.boot.info.BuildProperties;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class VersionService {

    private final String version;

    public VersionService(BuildProperties buildProperties) {
        this.version = buildProperties.getVersion();
        log.info("Conductor version: {}", this.version);
    }

    public String getVersion() {
        return version;
    }
}
