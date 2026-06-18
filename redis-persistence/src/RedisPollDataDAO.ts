import { PollDataDAO } from '@agentmesh/common-persistence';
import { PollData } from '@agentmesh/common';
import { Redis } from 'ioredis';

export class RedisPollDataDAO implements PollDataDAO {
  constructor(private readonly redis: Redis) {}

  async updateLastPollData(taskDefName: string, domain: string, workerId: string): Promise<void> {
    const key = `POLL_DATA:${taskDefName}:${domain || 'default'}`;
    const data: PollData = { queueName: taskDefName, domain, workerId, lastPollTime: Date.now() };
    await this.redis.hset('ALL_POLL_DATA', key, JSON.stringify(data));
  }

  async getPollData(taskDefName: string, domain: string): Promise<PollData | undefined> {
    const key = `POLL_DATA:${taskDefName}:${domain || 'default'}`;
    const val = await this.redis.hget('ALL_POLL_DATA', key);
    return val ? JSON.parse(val) : undefined;
  }

  async getPollDataForTask(taskDefName: string): Promise<PollData[]> {
    const all = await this.getAllPollData();
    return all.filter((p) => p.queueName === taskDefName);
  }

  async getAllPollData(): Promise<PollData[]> {
    const vals = await this.redis.hvals('ALL_POLL_DATA');
    return vals.map((v: string) => JSON.parse(v));
  }
}
