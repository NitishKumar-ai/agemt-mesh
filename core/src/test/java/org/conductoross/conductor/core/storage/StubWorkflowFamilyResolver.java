package org.conductoross.conductor.core.storage;

import java.util.HashSet;
import java.util.Set;

/**
 * Test stub for {@link WorkflowFamilyResolver}. Returns a family containing only the queried
 * workflowId itself — simulating a workflow with no relatives.
 */
class StubWorkflowFamilyResolver implements WorkflowFamilyResolver {

    @Override
    public Set<String> getFamily(String workflowId) {
        if (workflowId == null) return Set.of();
        return new HashSet<>(Set.of(workflowId));
    }
}
