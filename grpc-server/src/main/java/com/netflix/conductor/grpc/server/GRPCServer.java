package com.netflix.conductor.grpc.server;

import java.io.IOException;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.grpc.BindableService;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

public class GRPCServer {

    private static final Logger LOGGER = LoggerFactory.getLogger(GRPCServer.class);

    private final Server server;

    public GRPCServer(int port, List<BindableService> services) {
        ServerBuilder<?> builder = ServerBuilder.forPort(port);
        services.forEach(builder::addService);
        server = builder.build();
    }

    @PostConstruct
    public void start() throws IOException {
        server.start();
        LOGGER.info("grpc: Server started, listening on " + server.getPort());
    }

    @PreDestroy
    public void stop() {
        if (server != null) {
            LOGGER.info("grpc: server shutting down");
            server.shutdown();
        }
    }
}
