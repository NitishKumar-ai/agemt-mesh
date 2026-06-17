package com.netflix.conductor.core.listener;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.netflix.conductor.model.WorkflowModel;

/** Stub listener default implementation */
public class WorkflowStatusListenerStub implements WorkflowStatusListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(WorkflowStatusListenerStub.class);

    @Override
    public void onWorkflowCompleted(WorkflowModel workflow) {
        LOGGER.debug("Workflow {} is completed", workflow.getWorkflowId());
    }

    @Override
    public void onWorkflowTerminated(WorkflowModel workflow) {
        LOGGER.debug("Workflow {} is terminated", workflow.getWorkflowId());
    }

    @Override
    public void onWorkflowFinalized(WorkflowModel workflow) {
        LOGGER.debug("Workflow {} is finalized", workflow.getWorkflowId());
    }
}
