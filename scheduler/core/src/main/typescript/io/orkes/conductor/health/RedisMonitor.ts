export interface RedisMonitor {
    getUsagePercentage(): number;
    isMemoryCritical(): boolean;
    getMemoryUsage(): number;
}
