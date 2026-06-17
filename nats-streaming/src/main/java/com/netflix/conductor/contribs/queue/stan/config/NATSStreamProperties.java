package com.netflix.conductor.contribs.queue.stan.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import io.nats.client.Options;

@ConfigurationProperties("conductor.event-queues.nats-stream")
public class NATSStreamProperties {

    /** The cluster id of the STAN session */
    private String clusterId = "test-cluster";

    /** The durable subscriber name for the subscription */
    private String durableName = null;

    /** The NATS connection url */
    private String url = Options.DEFAULT_URL;

    /** The prefix to be used for the default listener queues */
    private String listenerQueuePrefix = "";

    /** WAIT tasks default queue group, to make subscription round-robin delivery to single sub */
    private String defaultQueueGroup = "wait-group";

    public String getClusterId() {
        return clusterId;
    }

    public void setClusterId(String clusterId) {
        this.clusterId = clusterId;
    }

    public String getDurableName() {
        return durableName;
    }

    public void setDurableName(String durableName) {
        this.durableName = durableName;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getListenerQueuePrefix() {
        return listenerQueuePrefix;
    }

    public void setListenerQueuePrefix(String listenerQueuePrefix) {
        this.listenerQueuePrefix = listenerQueuePrefix;
    }

    public String getDefaultQueueGroup() {
        return defaultQueueGroup;
    }

    public void setDefaultQueueGroup(String defaultQueueGroup) {
        this.defaultQueueGroup = defaultQueueGroup;
    }
}
