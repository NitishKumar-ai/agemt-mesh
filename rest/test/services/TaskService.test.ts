import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import {
  SqliteExecutionDAO,
  SqliteMetadataDAO,
  SqliteQueueDAO,
  SqlitePollDataDAO,
} from '@agentmesh/sqlite-persistence';
import { TaskService } from '../../src/services/TaskService.js';
import { TaskStatus, WorkflowStatus } from '@agentmesh/common';
import type { TaskModel } from '@agentmesh/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

function makeTask(overrides: Partial<TaskModel> = {}): TaskModel {
  return {
    taskId: `task-${Date.now()}-${Math.random()}`,
    workflowInstanceId: 'wf-1',
    taskType: 'test_task',
    referenceTaskName: 't1',
    status: TaskStatus.IN_PROGRESS,
    inputData: {},
    outputData: {},
    startTime: Date.now(),
    ...overrides,
  } as TaskModel;
}

describe('TaskService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: TaskService;
  let executionDAO: any;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    const pollDataDAO = new SqlitePollDataDAO(db);
    service = new TaskService(executionDAO, queueDAO, metadataDAO, pollDataDAO);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db.deleteFrom('task').execute();
    await db.deleteFrom('queue_message').execute();
    await db.deleteFrom('queue').execute();
    await db.deleteFrom('workflow').execute();
    await db.deleteFrom('workflow_to_task').execute();
    await db.deleteFrom('task_in_progress').execute();
    await db.deleteFrom('task_scheduled').execute();
    await db.deleteFrom('task_log').execute();
    await db.deleteFrom('workflow_pending').execute();
    await db.deleteFrom('workflow_def_to_workflow').execute();
  });

  it('poll returns undefined when queue is empty', async () => {
    const task = await service.poll('test_task');
    expect(task).toBeUndefined();
  });

  it('poll returns a task when one is queued', async () => {
    const task = makeTask();
    await executionDAO.createTasks([task]);

    const taskType = task.taskType ?? 'test_task';

    await db
      .insertInto('queue_message')
      .values({
        queue_name: taskType,
        message_id: task.taskId,
        priority: 0,
        popped: 0,
        offset_time_seconds: '0',
        deliver_on: sql`datetime('now')`,
      })
      .execute();

    const polled = await service.poll(taskType);
    expect(polled).toBeDefined();
    expect(polled!.taskId).toBe(task.taskId);
  });

  it('pollBatch returns queued tasks', async () => {
    const task1 = makeTask({ taskId: 'batch-1' });
    const task2 = makeTask({ taskId: 'batch-2' });
    await executionDAO.createTasks([task1, task2]);

    const taskType = 'test_task';

    for (const t of [task1, task2]) {
      await db
        .insertInto('queue_message')
        .values({
          queue_name: taskType,
          message_id: t.taskId,
          priority: 0,
          popped: 0,
          offset_time_seconds: '0',
          deliver_on: sql`datetime('now')`,
        })
        .execute();
    }

    const tasks = await service.pollBatch(taskType, 10);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('getTask returns undefined for non-existent task', async () => {
    const task = await service.getTask('nonexistent');
    expect(task).toBeUndefined();
  });

  it('getQueueSize returns 0 for empty queue', async () => {
    const size = await service.getQueueSize('test_task');
    expect(size).toBe(0);
  });

  it('updateTask updates task status', async () => {
    const task = makeTask();
    await executionDAO.createTasks([task]);

    const taskType = task.taskType ?? 'test_task';
    await db
      .insertInto('queue_message')
      .values({
        queue_name: taskType,
        message_id: task.taskId,
        priority: 0,
        popped: 0,
        offset_time_seconds: '0',
        deliver_on: new Date().toISOString(),
      })
      .execute();

    const updated = await service.updateTask(task.taskId!, {
      workflowInstanceId: task.workflowInstanceId!,
      status: TaskStatus.COMPLETED,
      outputData: { result: 'ok' },
    });

    expect(updated.status).toBe(TaskStatus.COMPLETED);
    expect(updated.outputData).toEqual({ result: 'ok' });
  });

  it('updateTask throws for non-existent task', async () => {
    await expect(
      service.updateTask('nonexistent', {
        workflowInstanceId: 'wf-1',
        status: TaskStatus.COMPLETED,
      }),
    ).rejects.toThrow('not found');
  });

  it('getTasksByRefName returns tasks with matching ref name', async () => {
    const task = makeTask();
    await executionDAO.createTasks([task]);
    const tasks = await service.getTasksByRefName('wf-1', 't1');
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0]!.referenceTaskName).toBe('t1');
  });
});
