import { describe, it, expect, vi } from 'vitest';
import { CassandraConcurrentExecutionLimitDAO } from '../CassandraConcurrentExecutionLimitDAO.js';
import { Client } from 'cassandra-driver';

describe('CassandraConcurrentExecutionLimitDAO', () => {
  it('adds a task to limit tracking', async () => {
    const execute = vi.fn().mockResolvedValue({});
    const client = { execute } as unknown as Client;
    const dao = new CassandraConcurrentExecutionLimitDAO(client);

    await dao.addTaskToLimit({
      taskId: 't1',
      taskDefName: 'def1',
      workflowInstanceId: 'wf1',
    } as any);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO concurrent_execution_limits'),
      expect.arrayContaining(['def1', 't1', 'wf1']),
      expect.any(Object),
    );
  });

  it('removes a task from limit tracking', async () => {
    const execute = vi.fn().mockResolvedValue({});
    const client = { execute } as unknown as Client;
    const dao = new CassandraConcurrentExecutionLimitDAO(client);

    await dao.removeTaskFromLimit({
      taskId: 't1',
      taskDefName: 'def1',
    } as any);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM concurrent_execution_limits'),
      ['def1', 't1'],
      expect.any(Object),
    );
  });

  it('does not exceed limit when no limit is configured', async () => {
    const client = {} as unknown as Client;
    const dao = new CassandraConcurrentExecutionLimitDAO(client);

    const result = await dao.exceedsLimit({
      taskId: 't1',
      taskDefName: 'def1',
      taskDefinition: undefined,
    } as any);

    expect(result).toBe(false);
  });

  it('checks exceedsLimit using count query', async () => {
    const execute = vi.fn().mockResolvedValue({
      rowLength: 1,
      first: () => ({ get: () => 2 }),
      rows: [],
    });
    const client = { execute } as unknown as Client;
    const dao = new CassandraConcurrentExecutionLimitDAO(client);

    const result = await dao.exceedsLimit({
      taskId: 't3',
      taskDefName: 'def1',
      taskDefinition: { name: 'def1', concurrentExecLimit: 2 } as any,
    } as any);

    // Returns true because count (2) >= limit (2)
    expect(result).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT'),
      ['def1'],
      expect.any(Object),
    );
  });
});
