package com.netflix.conductor.test.integration.grpc;

import org.junit.Before;

import com.netflix.conductor.client.grpc.EventClient;
import com.netflix.conductor.client.grpc.MetadataClient;
import com.netflix.conductor.client.grpc.TaskClient;
import com.netflix.conductor.client.grpc.WorkflowClient;

public class GrpcEndToEndTest extends TestHarnessAbstractGrpcEndToEndTest {

    @Before
    public void init() {
        taskClient = new TaskClient("localhost", 8092);
        workflowClient = new WorkflowClient("localhost", 8092);
        metadataClient = new MetadataClient("localhost", 8092);
        eventClient = new EventClient("localhost", 8092);
    }
}
