import { RateLimitingDAO } from '@agentmesh/common-persistence';
import { TaskModel, TaskDef } from '@agentmesh/common';
import { Redis } from 'ioredis';

export class RedisRateLimitingDAO implements RateLimitingDAO {
  constructor(private readonly redis: Redis) {}

  async exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean> {
    if (!taskDef.rateLimitPerFrequency || taskDef.rateLimitPerFrequency <= 0) {
      return false;
    }
    const key = `RATE_LIMIT:${taskDef.name}`;
    const limit = taskDef.rateLimitPerFrequency;
    const windowSecs = taskDef.rateLimitFrequencyInSeconds || 1;
    
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSecs);
    }
    return count > limit;
  }
}
