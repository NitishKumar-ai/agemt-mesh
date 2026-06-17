package com.netflix.conductor.grpc.server.service;

import org.springframework.stereotype.Service;

import io.grpc.health.v1.HealthCheckRequest;
import io.grpc.health.v1.HealthCheckResponse;
import io.grpc.health.v1.HealthGrpc;
import io.grpc.stub.StreamObserver;

@Service("grpcHealthService")
public class HealthServiceImpl extends HealthGrpc.HealthImplBase {

    // SBMTODO: Move this Spring boot health check
    @Override
    public void check(
            HealthCheckRequest request, StreamObserver<HealthCheckResponse> responseObserver) {
        responseObserver.onNext(
                HealthCheckResponse.newBuilder()
                        .setStatus(HealthCheckResponse.ServingStatus.SERVING)
                        .build());
        responseObserver.onCompleted();
    }
}
