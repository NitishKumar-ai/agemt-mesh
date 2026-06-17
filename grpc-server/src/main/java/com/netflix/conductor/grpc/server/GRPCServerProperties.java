package com.netflix.conductor.grpc.server;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.grpc-server")
public class GRPCServerProperties {

    /** The port at which the gRPC server will serve requests */
    private int port = 8090;

    /** Enables the reflection service for Protobuf services */
    private boolean reflectionEnabled = true;

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public boolean isReflectionEnabled() {
        return reflectionEnabled;
    }

    public void setReflectionEnabled(boolean reflectionEnabled) {
        this.reflectionEnabled = reflectionEnabled;
    }
}
