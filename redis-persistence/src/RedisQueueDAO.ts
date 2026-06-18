import { QueueDAO } from '@agentmesh/common-persistence';
import { Message } from '@agentmesh/common';
import { Redis } from 'ioredis';

export class RedisQueueDAO implements QueueDAO {
  constructor(private readonly redis: Redis) {}

  async push(queueName: string, id: string, offsetTimeInSecond: number, priority?: number): Promise<void> {
    await this.redis.rpush(`QUEUE:${queueName}`, id);
  }
  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    for (const m of messages) {
      if (m.id) {
        await this.redis.rpush(`QUEUE:${queueName}`, m.id);
      }
    }
  }
  async pushIfNotExists(queueName: string, id: string, offsetTimeInSecond: number, priority?: number): Promise<boolean> {
    await this.redis.rpush(`QUEUE:${queueName}`, id);
    return true;
  }
  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const res = await this.redis.lpop(`QUEUE:${queueName}`, count);
    if (!res) return [];
    return Array.isArray(res) ? res : [res];
  }
  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    const ids = await this.pop(queueName, count, timeout);
    return ids.map(id => ({ id, payload: '', priority: 0, timeout: 0 }));
  }
  async remove(queueName: string, messageId: string): Promise<void> {
    await this.redis.lrem(`QUEUE:${queueName}`, 0, messageId);
  }
  async getSize(queueName: string): Promise<number> {
    return this.redis.llen(`QUEUE:${queueName}`);
  }
  async ack(queueName: string, messageId: string): Promise<boolean> {
    return true;
  }
  async setUnackTimeout(queueName: string, messageId: string, unackTimeout: number): Promise<boolean> {
    return true;
  }
  async setUnackTimeoutIfShorter(queueName: string, messageId: string, unackTimeout: number): Promise<boolean> {
    return true;
  }
  async flush(queueName: string): Promise<void> {
    await this.redis.del(`QUEUE:${queueName}`);
  }
  async queuesDetail(): Promise<Record<string, number>> {
    return {};
  }
  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    return {};
  }
  async processUnacks(queueName: string): Promise<void> {}
  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    return true;
  }
  async postpone(queueName: string, messageId: string, priority: number, postponeDurationInSeconds: number): Promise<boolean> {
    return true;
  }
  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    return false;
  }
  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    return this.redis.lrange(`QUEUE:${queueName}`, 0, count - 1);
  }
}
