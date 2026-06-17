package com.netflix.conductor.mysql.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.mysql")
public class MySQLProperties {

    /** The time (in seconds) after which the in-memory task definitions cache will be refreshed */
    private Duration taskDefCacheRefreshInterval = Duration.ofSeconds(60);

    private Integer deadlockRetryMax = 3;

    public Duration getTaskDefCacheRefreshInterval() {
        return taskDefCacheRefreshInterval;
    }

    public void setTaskDefCacheRefreshInterval(Duration taskDefCacheRefreshInterval) {
        this.taskDefCacheRefreshInterval = taskDefCacheRefreshInterval;
    }

    public Integer getDeadlockRetryMax() {
        return deadlockRetryMax;
    }

    public void setDeadlockRetryMax(Integer deadlockRetryMax) {
        this.deadlockRetryMax = deadlockRetryMax;
    }
}
