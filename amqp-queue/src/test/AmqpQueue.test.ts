import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmqpQueue } from '../AmqpQueue.js';

describe('AmqpQueue', () => {
  let queue: AmqpQueue;

  beforeEach(() => {
    queue = new AmqpQueue({ url: 'amqp://localhost:5672' });
  });

  it('requires connect before push', async () => {
    await expect(queue.push('q', 'id', 0)).rejects.toThrow('not connected');
  });

  it('tracks known IDs for pushIfNotExists', async () => {
    // Mock connect to bypass actual AMQP
    const mockCh = {
      assertQueue: vi.fn().mockResolvedValue({ queue: 'agentmesh.test', messageCount: 0, consumerCount: 0 }),
      sendToQueue: vi.fn(),
      consume: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      checkQueue: vi.fn().mockResolvedValue({ queue: 'agentmesh.test', messageCount: 0, consumerCount: 0 }),
      deleteQueue: vi.fn().mockResolvedValue({ messageCount: 0 }),
      ack: vi.fn(),
      nack: vi.fn(),
      on: vi.fn(),
    };

    const mockConn = {
      createChannel: vi.fn().mockResolvedValue(mockCh),
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    // Manually set connected state to bypass real connection
    (queue as any).connection = mockConn;
    (queue as any).publishChannel = mockCh;
    (queue as any).connected = true;
    (queue as any).unackSweepTimer = setInterval(() => {}, 100000);

    // First push should succeed
    const result1 = await queue.pushIfNotExists('test_q', 'msg1', 0, 0);
    expect(result1).toBe(true);

    // Second push with same ID should be deduped
    const result2 = await queue.pushIfNotExists('test_q', 'msg1', 0, 0);
    expect(result2).toBe(false);
  });

  it('returns queue sizes', async () => {
    const mockCh = {
      assertQueue: vi.fn().mockResolvedValue({ queue: 'agentmesh.test', messageCount: 0, consumerCount: 0 }),
      sendToQueue: vi.fn(),
      consume: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      checkQueue: vi.fn().mockResolvedValue({ queue: 'agentmesh.test', messageCount: 5, consumerCount: 1 }),
      deleteQueue: vi.fn().mockResolvedValue({ messageCount: 5 }),
      ack: vi.fn(),
      nack: vi.fn(),
      on: vi.fn(),
    };

    const mockConn = {
      createChannel: vi.fn().mockResolvedValue(mockCh),
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    (queue as any).connection = mockConn;
    (queue as any).publishChannel = mockCh;
    (queue as any).connected = true;
    (queue as any).consumers.set('test_q', { channel: mockCh as any, queueName: 'test_q' });
    (queue as any).unackSweepTimer = setInterval(() => {}, 100000);

    const size = await queue.getSize('test_q');
    expect(size).toBe(5);
  });
});
