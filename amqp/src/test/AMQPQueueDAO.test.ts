import { describe, it, expect, vi } from 'vitest';
import { AMQPQueueDAO } from '../AMQPQueueDAO.js';
import { QueueDAO } from '@agentmesh/common-persistence';

describe('AMQPQueueDAO', () => {
  it('should transactionally push and call delegate push method', async () => {
    const mockDelegate: QueueDAO = {
      push: vi.fn(),
      pushMessages: vi.fn(),
      pushIfNotExists: vi.fn(),
      pop: vi.fn(),
      pollMessages: vi.fn(),
      remove: vi.fn(),
      getSize: vi.fn(),
      ack: vi.fn(),
      setUnackTimeout: vi.fn(),
      setUnackTimeoutIfShorter: vi.fn(),
      flush: vi.fn(),
      queuesDetail: vi.fn(),
      queuesDetailVerbose: vi.fn(),
      processUnacks: vi.fn(),
      resetOffsetTime: vi.fn(),
      postpone: vi.fn(),
      containsMessage: vi.fn(),
      peekFirstIds: vi.fn(),
    } as unknown as QueueDAO;

    const mockAmqpConnection = {
      getOrCreateChannel: vi.fn().mockResolvedValue({
        assertQueue: vi.fn().mockResolvedValue({}),
        sendToQueue: vi.fn().mockResolvedValue({}),
      }),
      returnChannel: vi.fn(),
    };

    // Instantiate with mock database delegate and connection URL
    const amqpQueueDao = new AMQPQueueDAO(mockDelegate, 'amqp://localhost:5672');
    (amqpQueueDao as any).amqpConnection = mockAmqpConnection;

    await amqpQueueDao.push('task_queue', 'test-task-1', 0, 0);

    expect(mockDelegate.push).toHaveBeenCalledWith('task_queue', 'test-task-1', 0, 0);
    expect(mockAmqpConnection.getOrCreateChannel).toHaveBeenCalled();
  });
});
