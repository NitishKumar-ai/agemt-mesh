package com.netflix.conductor.core.utils;

import java.util.UUID;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

public class IDGeneratorTest {

    @Test
    public void testGenerateSubWorkflowIdIsStableForTaskAttempt() {
        IDGenerator idGenerator = new IDGenerator();

        String first = idGenerator.generateSubWorkflowId("parent", "task", 0);
        String second = idGenerator.generateSubWorkflowId("parent", "task", 0);
        String retried = idGenerator.generateSubWorkflowId("parent", "task", 1);

        assertEquals(first, second);
        assertNotEquals(first, retried);
        UUID.fromString(first);
        UUID.fromString(retried);
    }
}
