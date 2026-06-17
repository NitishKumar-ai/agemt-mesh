package org.conductoross.conductor.core.storage;

import java.util.HashSet;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.netflix.conductor.dao.ExecutionDAO;
import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

/** Default {@link WorkflowFamilyResolver} — the access oracle for file-download scoping. */
@Component
@ConditionalOnProperty(name = "conductor.file-storage.enabled", havingValue = "true")
public class WorkflowFamilyResolverImpl implements WorkflowFamilyResolver {

    private final ExecutionDAO executionDAO;

    public WorkflowFamilyResolverImpl(ExecutionDAO executionDAO) {
        this.executionDAO = executionDAO;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Self is added before any DAO lookup so an archived workflow never loses access to files it
     * owns.
     */
    @Override
    public Set<String> getFamily(String workflowId) {
        Set<String> family = new HashSet<>();
        if (workflowId == null) return family;
        family.add(workflowId);
        collectAncestors(workflowId, family);
        collectDescendants(workflowId, family);
        return family;
    }

    /** Walks the parent chain. Stops at the first missing record — its parent pointer is gone. */
    private void collectAncestors(String workflowId, Set<String> visited) {
        WorkflowModel workflow = executionDAO.getWorkflow(workflowId, false);
        if (workflow == null) return;
        String parentId = workflow.getParentWorkflowId();
        if (StringUtils.isNotBlank(parentId) && visited.add(parentId)) {
            collectAncestors(parentId, visited);
        }
    }

    /**
     * Walks SUB_WORKFLOW children. {@code includeTasks=true} so child ids are loaded in one call.
     */
    private void collectDescendants(String workflowId, Set<String> visited) {
        WorkflowModel workflow = executionDAO.getWorkflow(workflowId, true);
        if (workflow == null) return;
        for (TaskModel task : workflow.getTasks()) {
            String childId = task.getSubWorkflowId();
            if (StringUtils.isNotBlank(childId) && visited.add(childId)) {
                collectDescendants(childId, visited);
            }
        }
    }
}
