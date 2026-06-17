package io.orkes.conductor.scheduler.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import lombok.Setter;

@Configuration
@ConfigurationProperties("conductor.scheduler")
@Getter
@Setter
public class SchedulerProperties {

    private int pollingThreadCount = 1;
    private int archivalThreadCount = 2;
    private String schedulerTimeZone = "UTC";

    private int pollingInterval = 100;
    private int pollBatchSize = 5;
    private int archivalPollBatchSize = 5;

    private int archivalMaintenanceIntervalRecordCount = 5000;
    private int archivalMaintenanceLockSeconds = 600;
    private int archivalMaintenanceLockTrySeconds = 1;
    private int archivalMaxRecords = 5;
    private int archivalMaxRecordThreshold = 10;
    private int maxScheduleJitterMs = 1000;
    private long initialDelayMs = 15000;

    private int userCacheExpireAfterWriteSeconds = 120;
    private int userCacheMaxSize = 1000;

    /** When true, the scheduler uses an external {@code SchedulerCacheDAO} for hot-path lookups. */
    private boolean cacheEnabled = false;
}
