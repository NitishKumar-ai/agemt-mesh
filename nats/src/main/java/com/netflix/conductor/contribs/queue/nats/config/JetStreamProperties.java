package com.netflix.conductor.contribs.queue.nats.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

import io.nats.client.Options;

/**
 * @author andrey.stelmashenko@gmail.com
 */
@ConfigurationProperties("conductor.event-queues.jsm")
public class JetStreamProperties {
    private String listenerQueuePrefix = "";

    /** The durable subscriber name for the subscription */
    private String durableName = "defaultQueue";

    private String streamStorageType = "file";
    private long streamMaxBytes = -1;

    /** The NATS connection url */
    private String url = Options.DEFAULT_URL;

    private Duration pollTimeDuration = Duration.ofMillis(100);

    /** WAIT tasks default queue group, to make subscription round-robin delivery to single sub */
    private String defaultQueueGroup = "wait-group";

    private int replicas = 3;

    private int maxReconnects = -1;

    private Duration ackWait = Duration.ofSeconds(60);
    private long maxAckPending = 100;
    private int maxDeliver = 5;

    public long getStreamMaxBytes() {
        return streamMaxBytes;
    }

    public void setStreamMaxBytes(long streamMaxBytes) {
        this.streamMaxBytes = streamMaxBytes;
    }

    public Duration getAckWait() {
        return ackWait;
    }

    public void setAckWait(Duration ackWait) {
        this.ackWait = ackWait;
    }

    public long getMaxAckPending() {
        return maxAckPending;
    }

    public void setMaxAckPending(long maxAckPending) {
        this.maxAckPending = maxAckPending;
    }

    public int getMaxDeliver() {
        return maxDeliver;
    }

    public void setMaxDeliver(int maxDeliver) {
        this.maxDeliver = maxDeliver;
    }

    public Duration getPollTimeDuration() {
        return pollTimeDuration;
    }

    public void setPollTimeDuration(Duration pollTimeDuration) {
        this.pollTimeDuration = pollTimeDuration;
    }

    public String getListenerQueuePrefix() {
        return listenerQueuePrefix;
    }

    public void setListenerQueuePrefix(String listenerQueuePrefix) {
        this.listenerQueuePrefix = listenerQueuePrefix;
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

    public String getStreamStorageType() {
        return streamStorageType;
    }

    public void setStreamStorageType(String streamStorageType) {
        this.streamStorageType = streamStorageType;
    }

    public String getDefaultQueueGroup() {
        return defaultQueueGroup;
    }

    public void setDefaultQueueGroup(String defaultQueueGroup) {
        this.defaultQueueGroup = defaultQueueGroup;
    }

    public int getReplicas() {
        return replicas;
    }

    public void setReplicas(int replicas) {
        this.replicas = replicas;
    }

    public int getMaxReconnects() {
        return maxReconnects;
    }

    public void setMaxReconnects(int maxReconnects) {
        this.maxReconnects = maxReconnects;
    }
}
