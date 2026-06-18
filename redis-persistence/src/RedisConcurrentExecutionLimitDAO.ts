import { ConcurrentExecutionLimitDAO } from '@agentmesh/common-persistence';
import { TaskModel } from '@agentmesh/common';
import { Redis } from 'ioredis';

export class RedisConcurrentExecutionLimitDAO implements ConcurrentExecutionLimitDAO {
  constructor(private readonly redis: Redis) {}

  async addTaskToLimit(task: TaskModel): Promise<void> {
    const key = `TASK_LIMIT:${task.taskDefName}`;
    if (task.taskId) {
      await this.redis.zadd(key, Date.now(), task.taskId);
    }
  }

  async removeTaskFromLimit(task: TaskModel): Promise<void> {
    const key = `TASK_LIMIT:${task.taskDefName}`;
    if (task.taskId) {
      await this.redis.zrem(key, task.taskId);
    }
  }

  async exceedsLimit(task: TaskModel): Promise<boolean> {
    const key = `TASK_LIMIT:${task.taskDefName}`;
    const count = await this.redis.zcard(key);
    return false;
  }
}
