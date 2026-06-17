package org.conductoross.conductor.core.storage;

import java.util.Set;

/**
 * Resolves the full family tree of a workflow: self, all ancestors (parentWorkflowId chain), and
 * all descendants (recursive children), with no depth limit.
 *
 * <p>The given workflowId is always included in the returned set — a workflow is, by definition, a
 * member of its own family. This holds even when the workflow record has been archived from the
 * active execution DAO, which would otherwise prevent a long-running workflow from accessing files
 * it owns once its record ages out.
 */
public interface WorkflowFamilyResolver {

    /**
     * Returns the family of the given workflowId.
     *
     * <p>The result always contains {@code workflowId} itself (when non-null). Ancestors and
     * descendants are added when the underlying execution DAO can resolve them; an unknown
     * workflowId still resolves to a single-element set containing only itself.
     *
     * @return a non-null set; empty only when {@code workflowId} is {@code null}
     */
    Set<String> getFamily(String workflowId);
}
