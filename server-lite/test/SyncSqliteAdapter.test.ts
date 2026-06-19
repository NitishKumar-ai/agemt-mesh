import { describe, it, expect } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { InitialSchemaMigration, AgentRuntimeMigration } from '@agentmesh/common-persistence';
import { SyncSqliteAdapter } from '../src/SyncSqliteAdapter.js';
import { createWorkflowModel, createTaskModel } from '@agentmesh/core';

describe('SyncSqliteAdapter', () => {
  async function setupDb() {
    const sqliteDb = new DatabaseDriver(':memory:');
    const db = new Kysely<any>({
      dialect: new SqliteDialect({
        database: sqliteDb,
      }),
    });

    await InitialSchemaMigration.up(db as never);
    await AgentRuntimeMigration.up(db as never);

    const adapter = new SyncSqliteAdapter(sqliteDb as any);
    return { sqliteDb, db, adapter };
  }

  it('should push, contain, pop, and remove queue messages', async () => {
    const { adapter } = await setupDb();

    // Ensure queue is populated and contains check works
    adapter.push('test_queue', 'msg_1', 10, 0);
    expect(adapter.containsMessage('test_queue', 'msg_1')).toBe(true);
    expect(adapter.containsMessage('test_queue', 'msg_2')).toBe(false);

    // Pop the message
    const popped = await adapter.pop('test_queue', 1, 0);
    expect(popped).toEqual(['msg_1']);

    // Pop when empty
    const poppedEmpty = await adapter.pop('test_queue', 1, 0);
    expect(poppedEmpty).toEqual([]);

    // containsMessage should now be false (popped messages are marked popped = 1)
    expect(adapter.containsMessage('test_queue', 'msg_1')).toBe(false);

    // Reset offset time
    adapter.push('test_queue', 'msg_2', 10, 100); // 100s delay
    expect(adapter.popMessage('test_queue')).toBeNull(); // not deliverable yet
    
    const resetResult = adapter.resetOffsetTime('test_queue', 'msg_2');
    expect(resetResult).toBe(true);
    expect(adapter.popMessage('test_queue')).toBe('msg_2'); // deliverable now!

    // Remove message
    adapter.push('test_queue', 'msg_3', 10, 0);
    adapter.remove('test_queue', 'msg_3');
    expect(adapter.containsMessage('test_queue', 'msg_3')).toBe(false);
  });

  it('should push message with duration', async () => {
    const { adapter } = await setupDb();
    adapter.pushDuration('test_queue', 'msg_dur', 5, { seconds: 0 });
    expect(adapter.containsMessage('test_queue', 'msg_dur')).toBe(true);
    expect(adapter.popMessage('test_queue')).toBe('msg_dur');
  });

  it('should postpone a message', async () => {
    const { adapter } = await setupDb();
    adapter.push('test_queue', 'msg_postpone', 10, 0);
    adapter.postpone('test_queue', 'msg_postpone', 10, 3600); // delay 1 hour
    expect(adapter.popMessage('test_queue')).toBeNull();
  });

  it('should manage workflows', async () => {
    const { adapter } = await setupDb();
    const wf = createWorkflowModel({
      workflowId: 'wf_123',
      workflowName: 'test_wf',
      status: 'RUNNING',
    });

    // Create workflow
    adapter.createWorkflow(wf);

    // Retrieve workflow
    const retrieved = adapter.getWorkflowModel('wf_123', true);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.workflowId).toBe('wf_123');
    expect(retrieved!.status).toBe('RUNNING');

    // Update workflow status
    wf.status = 'COMPLETED';
    adapter.updateWorkflow(wf);
    const updated = adapter.getWorkflowModelFromExecutionDAO('wf_123', false);
    expect(updated.status).toBe('COMPLETED');

    // Get running workflow IDs and pending workflows by name
    const runningIds = adapter.getRunningWorkflowIds('test_wf', 1);
    expect(runningIds).toEqual([]); // since status is COMPLETED now (it's terminal)

    // Remove workflow
    adapter.removeWorkflow('wf_123', true);
    expect(adapter.getWorkflowModel('wf_123', false)).toBeNull();

    // Throws if workflow not found via getWorkflowModelFromExecutionDAO
    expect(() => adapter.getWorkflowModelFromExecutionDAO('wf_123', false)).toThrow();
  });

  it('should manage tasks', async () => {
    const { adapter } = await setupDb();
    const task = createTaskModel({
      taskId: 'task_abc',
      workflowInstanceId: 'wf_123',
      referenceTaskName: 'step1',
      taskType: 'SIMPLE',
      status: 'SCHEDULED',
    });

    // Create tasks
    adapter.createTasks([task]);

    // Retrieve task
    const retrieved = adapter.getTaskModel('task_abc');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.taskId).toBe('task_abc');

    // Update task
    task.status = 'COMPLETED';
    adapter.updateTask(task);
    const updated = adapter.getTaskModel('task_abc');
    expect(updated!.status).toBe('COMPLETED');

    // Remove task
    adapter.removeTask('task_abc');
    expect(adapter.getTaskModel('task_abc')).toBeNull();
  });

  it('should handle log operations and pending workflows', async () => {
    const { adapter } = await setupDb();
    const wf = createWorkflowModel({
      workflowId: 'wf_pending',
      workflowName: 'pending_name',
      status: 'RUNNING',
    });
    adapter.createWorkflow(wf);

    const pending = adapter.getPendingWorkflowsByName('pending_name', 1);
    expect(pending).toHaveLength(1);
    expect(pending[0].workflowId).toBe('wf_pending');

    const running = adapter.getRunningWorkflowIds('pending_name', 1);
    expect(running).toEqual(['wf_pending']);

    const wfsByName = adapter.getWorkflowsByName('pending_name', 0, 0);
    expect(wfsByName).toHaveLength(1);
    expect(wfsByName[0].workflowId).toBe('wf_pending');

    // Remove from pending
    adapter.removeFromPendingWorkflow('pending_name', 'wf_pending');
    expect(adapter.getPendingWorkflowsByName('pending_name', 1)).toHaveLength(0);

    // Log operations
    adapter.addTaskExecLog([{ log: 'Hello log', taskId: 'task_log_1' }]);
  });
});
