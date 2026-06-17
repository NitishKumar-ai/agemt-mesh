package com.netflix.conductor.redis.testutil;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

import lombok.NonNull;

public class FixedPortContainer extends GenericContainer {

    public FixedPortContainer(@NonNull DockerImageName dockerImageName) {
        super(dockerImageName);
    }

    public void exposePort(int localPort, int containerPort) {
        super.addFixedExposedPort(localPort, containerPort);
    }
}
