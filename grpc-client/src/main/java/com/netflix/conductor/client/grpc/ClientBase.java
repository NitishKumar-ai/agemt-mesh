package com.netflix.conductor.client.grpc;

import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.netflix.conductor.grpc.ProtoMapper;
import com.netflix.conductor.grpc.SearchPb;

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.Nullable;

abstract class ClientBase {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClientBase.class);
    protected static ProtoMapper protoMapper = ProtoMapper.INSTANCE;

    protected final ManagedChannel channel;

    public ClientBase(String address, int port) {
        this(ManagedChannelBuilder.forAddress(address, port).usePlaintext());
    }

    public ClientBase(ManagedChannelBuilder<?> builder) {
        channel = builder.build();
    }

    public void shutdown() throws InterruptedException {
        channel.shutdown().awaitTermination(5, TimeUnit.SECONDS);
    }

    SearchPb.Request createSearchRequest(
            @Nullable Integer start,
            @Nullable Integer size,
            @Nullable String sort,
            @Nullable String freeText,
            @Nullable String query) {
        SearchPb.Request.Builder request = SearchPb.Request.newBuilder();
        if (start != null) request.setStart(start);
        if (size != null) request.setSize(size);
        if (sort != null) request.setSort(sort);
        if (freeText != null) request.setFreeText(freeText);
        if (query != null) request.setQuery(query);
        return request.build();
    }
}
