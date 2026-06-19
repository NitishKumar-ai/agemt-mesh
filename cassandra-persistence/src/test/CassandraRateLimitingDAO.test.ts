import { describe, it, expect, vi } from 'vitest';
import { CassandraRateLimitingDAO } from '../CassandraRateLimitingDAO.js';
import { Client } from 'cassandra-driver';

describe('CassandraRateLimitingDAO', () => {
  it('returns false when rate limit is not configured', async () => {
    const client = {} as unknown as Client;
    const dao = new CassandraRateLimitingDAO(client);

    const result = await dao.exceedsRateLimitPerFrequency(
      { taskId: 't1', taskDefName: 'def1' } as any,
      { name: 'def1' } as any,
    );

    expect(result).toBe(false);
  });

  it('increments counter and checks limit on each call', async () => {
    const execute = vi.fn();
    const client = { execute } as unknown as Client;

    // Mock the SELECT to return count=1
    execute.mockResolvedValue({
      rowLength: 1,
      first: () => ({ get: () => 1 }),
      rows: [],
    });

    const dao = new CassandraRateLimitingDAO(client);

    const result = await dao.exceedsRateLimitPerFrequency(
      { taskId: 't1', taskDefName: 'rate_limited_def' } as any,
      { name: 'rate_limited_def', rateLimitPerFrequency: 2, rateLimitFrequencyInSeconds: 1 } as any,
    );

    expect(result).toBe(false);
    // First call: UPDATE counter
    expect(execute.mock.calls[0]![0]).toContain('UPDATE rate_limit_counters');
    // Second call: SELECT count
    expect(execute.mock.calls[1]![0]).toContain('SELECT count FROM rate_limit_counters');
  });

  it('returns true when limit is exceeded', async () => {
    const execute = vi.fn();
    const client = { execute } as unknown as Client;

    // Mock the SELECT to return count=3 (limit is 2)
    execute.mockResolvedValue({
      rowLength: 1,
      first: () => ({ get: () => 3 }),
      rows: [],
    });

    const dao = new CassandraRateLimitingDAO(client);

    const result = await dao.exceedsRateLimitPerFrequency(
      { taskId: 't1', taskDefName: 'rate_limited_def' } as any,
      { name: 'rate_limited_def', rateLimitPerFrequency: 2, rateLimitFrequencyInSeconds: 1 } as any,
    );

    expect(result).toBe(true);
  });
});
