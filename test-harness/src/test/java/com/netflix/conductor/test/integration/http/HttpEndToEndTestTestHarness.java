package com.netflix.conductor.test.integration.http;

import org.junit.Before;

import com.netflix.conductor.client.http.EventClient;
import com.netflix.conductor.client.http.MetadataClient;
import com.netflix.conductor.client.http.TaskClient;
import com.netflix.conductor.client.http.WorkflowClient;

public class HttpEndToEndTestTestHarness extends TestHarnessAbstractHttpEndToEndTest {

    @Before
    public void init() {
        apiRoot = String.format("http://localhost:%d/api/", port);

        taskClient = new TaskClient();
        taskClient.setRootURI(apiRoot);

        workflowClient = new WorkflowClient();
        workflowClient.setRootURI(apiRoot);

        metadataClient = new MetadataClient();
        metadataClient.setRootURI(apiRoot);

        eventClient = new EventClient();
        eventClient.setRootURI(apiRoot);
    }
}
