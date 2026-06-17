package com.netflix.conductor.contribs.listener.conductorqueue;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.workflow-status-listener.queue-publisher")
public class ConductorQueueStatusPublisherProperties {

    private String successQueue = "_callbackSuccessQueue";

    private String failureQueue = "_callbackFailureQueue";

    private String finalizeQueue = "_callbackFinalizeQueue";

    public String getSuccessQueue() {
        return successQueue;
    }

    public void setSuccessQueue(String successQueue) {
        this.successQueue = successQueue;
    }

    public String getFailureQueue() {
        return failureQueue;
    }

    public void setFailureQueue(String failureQueue) {
        this.failureQueue = failureQueue;
    }

    public String getFinalizeQueue() {
        return finalizeQueue;
    }

    public void setFinalizeQueue(String finalizeQueue) {
        this.finalizeQueue = finalizeQueue;
    }
}
