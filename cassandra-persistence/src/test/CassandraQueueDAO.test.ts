import { describe, it, expect, vi } from 'vitest';
import { CassandraQueueDAO } from '../CassandraQueueDAO.js';
import { Client } from 'cassandra-driver';

function mockResultSet(overrides: Partial<any> = {}) {
  return {
    rows: [],
    rowLength: 0,
    first: () => null,
    wasApplied: () => true,
    ...overrides,
  };
}

function mockClient(): Client {
  return {
    execute: vi.fn().mockResolvedValue(mockResultSet()),
    batch: vi.fn().mockResolvedValue({}),
  } as unknown as Client;
}

describe('CassandraQueueDAO', () => {
  it('pushes a message', async () => {
    const client = mockClient();
    const dao = new CassandraQueueDAO(client);

    await dao.push('test_q', 'msg1', 0, 0);

    expect(client.execute).toHaveBeenCalledTimes(2);
    // First call: queue_messages insert
    const call1 = (client.execute as any).mock.calls[0];
    expect(call1[0]).toContain('INSERT INTO queue_messages');
    expect(call1[1]).toContain('test_q');
    expect(call1[1]).toContain('msg1');

    // Second call: queue_messages_by_time insert
    const call2 = (client.execute as any).mock.calls[1];
    expect(call2[0]).toContain('INSERT INTO queue_messages_by_time');
  });

  it('does ack and removes from both tables', async () => {
    const createdOn = { toString: () => 'abc-123' };
    const client = {
      execute: vi.fn(),
      batch: vi.fn().mockResolvedValue({}),
    } as unknown as Client;

    // First execute call — look up created_on
    (client.execute as any).mockResolvedValueOnce(
      mockResultSet({ rowLength: 1, first: () => ({ get: () => createdOn }) }),
    );

    const dao = new CassandraQueueDAO(client);
    const result = await dao.ack('test_q', 'msg1');

    expect(result).toBe(true);
    expect(client.batch).toHaveBeenCalledOnce();
    const batchQueries = (client.batch as any).mock.calls[0][0];
    expect(batchQueries).toHaveLength(2);
    expect(batchQueries[0].query).toContain('DELETE FROM queue_messages');
    expect(batchQueries[1].query).toContain('DELETE FROM queue_messages_by_time');
  });

  it('checks containsMessage', async () => {
    const client = {
      execute: vi.fn(),
    } as unknown as Client;

    (client.execute as any).mockResolvedValueOnce(
      mockResultSet({ rowLength: 1, first: () => ({ get: () => 'msg1' }) }),
    );

    const dao = new CassandraQueueDAO(client);
    const exists = await dao.containsMessage('test_q', 'msg1');

    expect(exists).toBe(true);
    expect(client.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT message_id FROM queue_messages'),
      ['test_q', 'msg1'],
      expect.any(Object),
    );
  });

  it('returns size', async () => {
    const client = {
      execute: vi.fn().mockResolvedValue(
        mockResultSet({ rowLength: 1, first: () => ({ get: () => 5 }) }),
      ),
    } as unknown as Client;

    const dao = new CassandraQueueDAO(client);
    const size = await dao.getSize('test_q');

    expect(size).toBe(5);
  });

  it('pushes and pushesIfNotExists', async () => {
    const client = mockClient();
    // First call returns empty — msg doesn't exist
    (client.execute as any).mockResolvedValueOnce(
      mockResultSet({ rowLength: 0 }),
    );
    // Subsequent calls for the actual push
    (client.execute as any).mockResolvedValue(mockResultSet());

    const dao = new CassandraQueueDAO(client);
    const result = await dao.pushIfNotExists('test_q', 'msg1', 0, 0);

    expect(result).toBe(true);
  });

  it('handles pushIfNotExists when message already exists', async () => {
    const client = {
      execute: vi.fn().mockResolvedValue(
        mockResultSet({ rowLength: 1, first: () => ({ get: () => 'msg1' }) }),
      ),
    } as unknown as Client;

    const dao = new CassandraQueueDAO(client);
    const result = await dao.pushIfNotExists('test_q', 'msg1', 0, 0);

    expect(result).toBe(false);
    // Only the check query was executed, no push
    expect(client.execute).toHaveBeenCalledTimes(1);
  });
});
