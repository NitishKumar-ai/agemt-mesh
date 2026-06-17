package org.conductoross.conductor.core.listener;

import com.netflix.conductor.common.metadata.events.EventHandler;
import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;

/** Listener for metadata changes: workflow definitions, task definitions, and event handlers. */
public interface MetadataChangeListener {

    default void onWorkflowDefRegistered(WorkflowDef workflowDef) {}

    default void onWorkflowDefUpdated(WorkflowDef workflowDef) {}

    default void onWorkflowDefUnregistered(String name, int version) {}

    default void onTaskDefRegistered(TaskDef taskDef) {}

    default void onTaskDefUpdated(TaskDef taskDef) {}

    default void onTaskDefUnregistered(String taskType) {}

    default void onEventHandlerRegistered(EventHandler eventHandler) {}

    default void onEventHandlerUpdated(EventHandler eventHandler) {}

    default void onEventHandlerUnregistered(String name) {}
}
