package io.conductor.e2e.util;

import com.netflix.conductor.client.http.ConductorClient;
import com.netflix.conductor.client.http.EventClient;
import com.netflix.conductor.client.http.MetadataClient;
import com.netflix.conductor.client.http.TaskClient;
import com.netflix.conductor.client.http.WorkflowClient;

public class ApiUtil {

    // The conductor-client SDK appends paths like /metadata/workflow to the basePath,
    // so we must point basePath to the API root (/api), not the server root.
    // Check system property first (set by test-harness functional tests), then env var.
    private static final String SERVER_HOST =
            System.getProperty(
                    "SERVER_ROOT_URI",
                    System.getenv().getOrDefault("SERVER_ROOT_URI", "http://localhost:8000/api"));

    public static final String SERVER_ROOT_URI =
            SERVER_HOST.endsWith("/api") ? SERVER_HOST : SERVER_HOST + "/api";

    public static final ConductorClient CLIENT =
            ConductorClient.builder()
                    .basePath(SERVER_ROOT_URI)
                    .readTimeout(
                            30_000) // 30 seconds to support synchronous workflow execution endpoint
                    .build();

    public static final WorkflowClient WORKFLOW_CLIENT = new WorkflowClient(CLIENT);
    public static final TaskClient TASK_CLIENT = new TaskClient(CLIENT);
    public static final MetadataClient METADATA_CLIENT = new MetadataClient(CLIENT);
    public static final EventClient EVENT_CLIENT = new EventClient(CLIENT);
}
