package org.conductoross.conductor.core.listener;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.netflix.conductor.common.metadata.events.EventHandler;
import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;

/** Stub listener default implementation. Logs each metadata change at debug level. */
public class MetadataChangeListenerStub implements MetadataChangeListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(MetadataChangeListenerStub.class);

    @Override
    public void onWorkflowDefRegistered(WorkflowDef workflowDef) {
        LOGGER.debug(
                "Workflow def {} version {} registered",
                workflowDef.getName(),
                workflowDef.getVersion());
    }

    @Override
    public void onWorkflowDefUpdated(WorkflowDef workflowDef) {
        LOGGER.debug(
                "Workflow def {} version {} updated",
                workflowDef.getName(),
                workflowDef.getVersion());
    }

    @Override
    public void onWorkflowDefUnregistered(String name, int version) {
        LOGGER.debug("Workflow def {} version {} unregistered", name, version);
    }

    @Override
    public void onTaskDefRegistered(TaskDef taskDef) {
        LOGGER.debug("Task def {} registered", taskDef.getName());
    }

    @Override
    public void onTaskDefUpdated(TaskDef taskDef) {
        LOGGER.debug("Task def {} updated", taskDef.getName());
    }

    @Override
    public void onTaskDefUnregistered(String taskType) {
        LOGGER.debug("Task def {} unregistered", taskType);
    }

    @Override
    public void onEventHandlerRegistered(EventHandler eventHandler) {
        LOGGER.debug("Event handler {} registered", eventHandler.getName());
    }

    @Override
    public void onEventHandlerUpdated(EventHandler eventHandler) {
        LOGGER.debug("Event handler {} updated", eventHandler.getName());
    }

    @Override
    public void onEventHandlerUnregistered(String name) {
        LOGGER.debug("Event handler {} unregistered", name);
    }
}
