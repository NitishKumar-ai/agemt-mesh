package com.netflix.conductor.core.utils;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * ID Generator used by Conductor. The default ID generator uses UUID v4 as the ID format. By
 * providing a custom IDGenerator bean it is possible to use a different scheme for ID generation.
 * However, this is not normal and should only be done after very careful consideration.
 *
 * <p>Please note, if you use Cassandra persistence, the schema uses UUID as the column type and the
 * IDs have to be valid UUIDs supported by Cassandra.
 */
public class IDGenerator {

    public IDGenerator() {}

    public String generate() {
        return UUID.randomUUID().toString();
    }

    public String generateSubWorkflowId(
            String parentWorkflowId, String parentWorkflowTaskId, int retryCount) {
        String source =
                String.format(
                        "subworkflow:%s:%s:%d", parentWorkflowId, parentWorkflowTaskId, retryCount);
        return UUID.nameUUIDFromBytes(source.getBytes(StandardCharsets.UTF_8)).toString();
    }
}
