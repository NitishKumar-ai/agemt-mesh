import { Message } from '@agentmesh/common';

export interface QueueDAO {
  push(queueName: string, id: string, offsetTimeInSecond: number, priority?: number): Promise<void>;
  pushMessages(queueName: string, messages: Message[]): Promise<void>;
  pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority?: number,
  ): Promise<boolean>;

  pop(queueName: string, count: number, timeout: number): Promise<string[]>;
  pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]>;
  remove(queueName: string, messageId: string): Promise<void>;
  getSize(queueName: string): Promise<number>;
  ack(queueName: string, messageId: string): Promise<boolean>;

  setUnackTimeout(queueName: string, messageId: string, unackTimeout: number): Promise<boolean>;
  setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean>;
  flush(queueName: string): Promise<void>;
  queuesDetail(): Promise<Record<string, number>>;
  queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>>;
  processUnacks(queueName: string): Promise<void>;

  resetOffsetTime(queueName: string, id: string): Promise<boolean>;
  postpone(
    queueName: string,
    messageId: string,
    priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean>;
  containsMessage(queueName: string, messageId: string): Promise<boolean>;
  peekFirstIds(queueName: string, count: number): Promise<string[]>;
}
