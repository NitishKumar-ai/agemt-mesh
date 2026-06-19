import { describe, it, expect, vi } from 'vitest';
import { CassandraIndexDAO } from '../CassandraIndexDAO.js';
import { Client } from 'cassandra-driver';
import { TaskExecLog, EventExecution } from '@agentmesh/common';

describe('CassandraIndexDAO', () => {
  it('indexes a workflow', async () => {
    const execute = vi.fn().mockResolvedValue({});
    const client = { execute } as unknown as Client;
    const dao = new CassandraIndexDAO(client);

    await dao.indexWorkflow({
      workflowId: 'wf1',
      workflowName: 'test_wf',
    } as any);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workflow_index'),
      ['wf1', expect.stringContaining('test_wf')],
      expect.any(Object),
    );
  });

  it('indexes a task', async () => {
    const execute = vi.fn().mockResolvedValue({});
    const client = { execute } as unknown as Client;
    const dao = new CassandraIndexDAO(client);

    await dao.indexTask({
      taskId: 't1',
      workflowInstanceId: 'wf1',
      taskDefName: 'def1',
    } as any);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_index'),
      ['wf1', 't1', expect.any(String)],
      expect.any(Object),
    );
  });

  it('adds and retrieves task execution logs', async () => {
    const execute = vi.fn();
    const client = { execute, batch: vi.fn().mockResolvedValue({}) } as unknown as Client;

    const dao = new CassandraIndexDAO(client);

    const log: TaskExecLog = { log: 'test log', taskId: 't1', createdTime: Date.now() };
    await dao.addTaskExecutionLogs([log]);

    expect(client.batch).toHaveBeenCalledOnce();

    // Mock getTaskExecutionLogs to return the log
    (client.execute as any).mockResolvedValue({
      rowLength: 1,
      rows: [{ get: () => JSON.stringify(log) }],
      first: () => ({ get: () => JSON.stringify(log) }),
    });

    const logs = await dao.getTaskExecutionLogs('t1');
    expect(logs).toHaveLength(1);
    expect(logs[0]!.log).toBe('test log');
  });

  it('returns empty search results', async () => {
    const client = {} as unknown as Client;
    const dao = new CassandraIndexDAO(client);

    const result = await dao.searchWorkflows('query', 'freeText', 0, 10, []);

    expect(result).toEqual({ totalHits: 0, results: [] });
  });

  it('adds and gets event executions', async () => {
    const execute = vi.fn();
    const client = { execute } as unknown as Client;
    const dao = new CassandraIndexDAO(client);

    const eventExec: EventExecution = {
      name: 'handler1',
      messageId: 'msg1',
      event: 'test.event',
      created: Date.now(),
    } as any;

    await dao.addEventExecution(eventExec);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO indexed_event_executions'),
      ['handler1', 'msg1', expect.any(String)],
      expect.any(Object),
    );
  });

  it('removes a workflow and its tasks', async () => {
    const execute = vi.fn();
    const batch = vi.fn().mockResolvedValue({});
    const client = { execute, batch } as unknown as Client;

    // Mock the task lookup to return some tasks
    (client.execute as any).mockResolvedValueOnce({ rowLength: 0, rows: [], first: () => null });
    (client.execute as any).mockResolvedValueOnce({
      rowLength: 2,
      rows: [
        { get: () => 'task1' },
        { get: () => 'task2' },
      ],
      first: () => null,
    });

    const dao = new CassandraIndexDAO(client);

    await dao.removeWorkflow('wf1');

    // Should batch delete the workflow and tasks
    expect(batch).toHaveBeenCalled();
  });
});
