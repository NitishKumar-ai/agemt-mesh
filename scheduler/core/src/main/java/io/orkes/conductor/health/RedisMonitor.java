package io.orkes.conductor.health;

public interface RedisMonitor {

    int getUsagePercentage();

    boolean isMemoryCritical();

    int getMemoryUsage();
}
