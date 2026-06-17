package com.netflix.conductor.sqlite.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("conductor.sqlite")
public class SqliteProperties {

    /** The time (in seconds) after which the in-memory task definitions cache will be refreshed */
    private Duration taskDefCacheRefreshInterval = Duration.ofSeconds(60);

    private Integer deadlockRetryMax = 3;

    private boolean onlyIndexOnStatusChange = false;

    private Integer asyncMaxPoolSize = 10;

    private Integer asyncWorkerQueueSize = 10;

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

    public int getAsyncMaxPoolSize() {
        return asyncMaxPoolSize;
    }

    public int getAsyncWorkerQueueSize() {
        return asyncWorkerQueueSize;
    }

    public boolean getOnlyIndexOnStatusChange() {
        return onlyIndexOnStatusChange;
    }
}
