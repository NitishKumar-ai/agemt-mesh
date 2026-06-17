package com.netflix.conductor.test.integration.grpc.mysql;

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
            "conductor.db.type=mysql",
            "conductor.grpc-server.port=8094",
            "spring.datasource.url=jdbc:tc:mysql:8.0.27:///conductor", // "tc" prefix starts the
            // MySql
            // container
            "spring.datasource.username=root",
            "spring.datasource.password=root",
            "spring.datasource.hikari.maximum-pool-size=8",
            "spring.datasource.hikari.minimum-idle=300000",
            "conductor.elasticsearch.version=7",
            "conductor.indexing.type=elasticsearch",
            "conductor.app.workflow.name-validation.enabled=true"
        })
public class MySQLGrpcEndToEndTest extends AbstractGrpcEndToEndTest {

    @Before
    public void init() {
        taskClient = new TaskClient("localhost", 8094);
        workflowClient = new WorkflowClient("localhost", 8094);
        metadataClient = new MetadataClient("localhost", 8094);
        eventClient = new EventClient("localhost", 8094);
    }
}
