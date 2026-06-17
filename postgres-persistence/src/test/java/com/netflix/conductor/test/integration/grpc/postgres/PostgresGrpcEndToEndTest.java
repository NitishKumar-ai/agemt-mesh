package com.netflix.conductor.test.integration.grpc.postgres;

import org.junit.Before;
import org.junit.runner.RunWith;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;

import com.netflix.conductor.client.grpc.EventClient;
import com.netflix.conductor.client.grpc.MetadataClient;
import com.netflix.conductor.client.grpc.TaskClient;
import com.netflix.conductor.client.grpc.WorkflowClient;
import com.netflix.conductor.test.integration.grpc.AbstractGrpcEndToEndTest;

@RunWith(SpringRunner.class)
@TestPropertySource(
        properties = {
            "conductor.db.type=postgres",
            "conductor.postgres.experimentalQueueNotify=true",
            "conductor.app.asyncIndexingEnabled=false",
            "conductor.elasticsearch.version=7",
            "conductor.grpc-server.port=8098",
            "conductor.indexing.type=elasticsearch",
            "spring.datasource.url=jdbc:tc:postgresql:11.15-alpine:///conductor", // "tc" prefix
            // starts the
            // Postgres container
            "spring.datasource.username=postgres",
            "spring.datasource.password=postgres",
            "spring.datasource.hikari.maximum-pool-size=8",
            "spring.datasource.hikari.minimum-idle=300000",
            "spring.flyway.clean-disabled=true",
            "conductor.app.workflow.name-validation.enabled=true"
        })
public class PostgresGrpcEndToEndTest extends AbstractGrpcEndToEndTest {

    @Before
    public void init() {
        taskClient = new TaskClient("localhost", 8098);
        workflowClient = new WorkflowClient("localhost", 8098);
        metadataClient = new MetadataClient("localhost", 8098);
        eventClient = new EventClient("localhost", 8098);
    }
}
