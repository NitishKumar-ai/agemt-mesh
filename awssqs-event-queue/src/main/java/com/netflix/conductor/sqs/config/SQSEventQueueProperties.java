package com.netflix.conductor.sqs.config;

import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.convert.DurationUnit;

@ConfigurationProperties("conductor.event-queues.sqs")
public class SQSEventQueueProperties {

    /** The maximum number of messages to be fetched from the queue in a single request */
    private int batchSize = 1;

    /** The polling interval (in milliseconds) */
    private Duration pollTimeDuration = Duration.ofMillis(100);

    /** The visibility timeout (in seconds) for the message on the queue */
    @DurationUnit(ChronoUnit.SECONDS)
    private Duration visibilityTimeout = Duration.ofSeconds(60);

    /** The prefix to be used for the default listener queues */
    private String listenerQueuePrefix = "";

    /** The AWS account Ids authorized to send messages to the queues */
    private String authorizedAccounts = "";

    /** The endpoint to use to connect to a local SQS server for testing */
    private String endpoint = "";

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public Duration getPollTimeDuration() {
        return pollTimeDuration;
    }

    public void setPollTimeDuration(Duration pollTimeDuration) {
        this.pollTimeDuration = pollTimeDuration;
    }

    public Duration getVisibilityTimeout() {
        return visibilityTimeout;
    }

    public void setVisibilityTimeout(Duration visibilityTimeout) {
        this.visibilityTimeout = visibilityTimeout;
    }

    public String getListenerQueuePrefix() {
        return listenerQueuePrefix;
    }

    public void setListenerQueuePrefix(String listenerQueuePrefix) {
        this.listenerQueuePrefix = listenerQueuePrefix;
    }

    public String getAuthorizedAccounts() {
        return authorizedAccounts;
    }

    public void setAuthorizedAccounts(String authorizedAccounts) {
        this.authorizedAccounts = authorizedAccounts;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }
}
