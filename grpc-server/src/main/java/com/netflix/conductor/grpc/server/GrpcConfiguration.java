package com.netflix.conductor.grpc.server;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.grpc.BindableService;
import io.grpc.protobuf.services.ProtoReflectionService;

@Configuration
@ConditionalOnProperty(name = "conductor.grpc-server.enabled", havingValue = "true")
@EnableConfigurationProperties(GRPCServerProperties.class)
public class GrpcConfiguration {

    @Bean
    public GRPCServer grpcServer(
            List<BindableService> bindableServices, // all gRPC service implementations
            GRPCServerProperties grpcServerProperties) {
        if (grpcServerProperties.isReflectionEnabled()) {
            bindableServices.add(ProtoReflectionService.newInstance());
        }

        return new GRPCServer(grpcServerProperties.getPort(), bindableServices);
    }
}
