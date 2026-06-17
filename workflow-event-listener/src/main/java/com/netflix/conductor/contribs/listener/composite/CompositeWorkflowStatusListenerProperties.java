package com.netflix.conductor.contribs.listener.composite;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration properties for composite workflow status listener. */
@ConfigurationProperties("conductor.workflow-status-listener.composite")
public class CompositeWorkflowStatusListenerProperties {

    /**
     * List of listener types to enable. Valid values: workflow_publisher, queue_publisher, kafka,
     * archive
     */
    private List<String> types = new ArrayList<>();

    public List<String> getTypes() {
        return types;
    }

    public void setTypes(List<String> types) {
        this.types = types;
    }
}
