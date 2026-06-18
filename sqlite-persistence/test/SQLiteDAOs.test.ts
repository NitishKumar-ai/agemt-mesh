import DatabaseDriver from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

import type { Database, ExecutionDAO } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import { TaskModel, WorkflowModel } from '@agentmesh/common';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { runMetadataDAOContractTests } from '../../common-persistence/test/MetadataDAO.contract.js';
import { runExecutionDAOContractTests } from '../../common-persistence/test/ExecutionDAO.contract.js';
import { runPollDataDAOContractTests } from '../../common-persistence/test/PollDataDAO.contract.js';
import { runConcurrentExecutionLimitDAOContractTests } from '../../common-persistence/test/ConcurrentExecutionLimitDAO.contract.js';
import { runRateLimitingDAOContractTests } from '../../common-persistence/test/RateLimitingDAO.contract.js';

import { SqliteQueueDAO } from '../src/SQLiteQueueDAO.js';
import { SqliteMetadataDAO } from '../src/SQLiteMetadataDAO.js';
import { SqliteExecutionDAO } from '../src/SQLiteExecutionDAO.js';
import { SqlitePollDataDAO } from '../src/SqlitePollDataDAO.js';
import { SqliteConcurrentExecutionLimitDAO } from '../src/SqliteConcurrentExecutionLimitDAO.js';
import { SqliteRateLimitingDAO } from '../src/SqliteRateLimitingDAO.js';

describe('SQLite DAOs Integration', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: new DatabaseDriver(':memory:'),
      }),
    });
    await InitialSchemaMigration.up(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  const clearAllTables = async () => {
    const tables = [
      'queue_message',
      'queue',
      'workflow_to_task',
      'workflow_pending',
      'workflow_def_to_workflow',
      'workflow',
      'task',
      'task_in_progress',
      'task_scheduled',
      'task_log',
      'poll_data',
      'event_execution',
      'meta_workflow_def',
      'meta_task_def',
      'meta_event_handler'
    ];
    for (const table of tables) {
      await db.deleteFrom(table as any).execute();
    }
  };

  runQueueDAOContractTests(
    async () => new SqliteQueueDAO(db),
    clearAllTables,
  );

  runMetadataDAOContractTests(
    async () => new SqliteMetadataDAO(db),
    clearAllTables,
  );

  runExecutionDAOContractTests(
    async () => new SqliteExecutionDAO(db),
    clearAllTables,
  );

  runPollDataDAOContractTests(
    async () => new SqlitePollDataDAO(db),
    clearAllTables,
  );

  runConcurrentExecutionLimitDAOContractTests(
    async () => new SqliteConcurrentExecutionLimitDAO(db),
    async (taskDefName, taskId, workflowId, inProgress) => {
      await db.insertInto('task_in_progress')
        .values({
          task_def_name: taskDefName,
          task_id: taskId,
          workflow_id: workflowId,
          in_progress_status: (inProgress ? 1 : 0) as any,
        })
        .execute();
    },
    clearAllTables,
  );

  runRateLimitingDAOContractTests(
    async () => new SqliteRateLimitingDAO(db),
    clearAllTables,
  );

  describe('Crash-safety probe', () => {
    it('does not leave partial task data after a failed createTasks transaction', async () => {
      const dao = new SqliteExecutionDAO(db);

      const workflow: WorkflowModel = {
        workflowId: 'crash_test_wf',
        workflowName: 'crash_test',
        workflowType: 'crash_test',
        version: 1,
        status: 'RUNNING',
        input: {},
        createTime: Date.now(),
        tasks: [],
      };
      await dao.createWorkflow(workflow);

      const validTask: TaskModel = {
        taskId: 'valid_task',
        taskDefName: 'test_def',
        referenceTaskName: 'ref_valid',
        workflowInstanceId: 'crash_test_wf',
        status: 'IN_PROGRESS',
        inputData: {},
        createTime: Date.now(),
      };

      const invalidTask: TaskModel = {
        taskId: 'invalid_task',
        taskDefName: 'test_def',
        referenceTaskName: 'ref_invalid',
        workflowInstanceId: 'crash_test_wf',
        status: 'IN_PROGRESS',
        inputData: {},
        createTime: Date.now(),
      };

      validTask.taskId = undefined as any;

      await expect(dao.createTasks([invalidTask, validTask])).rejects.toThrow();
      const tasksAfterFail = await dao.getTasksForWorkflow('crash_test_wf');
      expect(tasksAfterFail.length).toBe(0);
    });

    it('preserves workflow data through create-update-read cycle', async () => {
      const dao = new SqliteExecutionDAO(db);

      const workflow: WorkflowModel = {
        workflowId: 'atomic_test_wf',
        workflowName: 'atomic_test',
        workflowType: 'atomic_test',
        version: 1,
        status: 'RUNNING',
        input: { phase: 'initial' },
        createTime: Date.now(),
        tasks: [],
      };

      await dao.createWorkflow(workflow);

      const task1: TaskModel = {
        taskId: 'atomic_task_1',
        taskDefName: 'atomic_def',
        referenceTaskName: 'ref_atomic_1',
        workflowInstanceId: 'atomic_test_wf',
        status: 'IN_PROGRESS',
        inputData: {},
        createTime: Date.now(),
      };
      const task2: TaskModel = {
        taskId: 'atomic_task_2',
        taskDefName: 'atomic_def',
        referenceTaskName: 'ref_atomic_2',
        workflowInstanceId: 'atomic_test_wf',
        status: 'SCHEDULED',
        inputData: {},
        createTime: Date.now(),
      };
      await dao.createTasks([task1, task2]);

      const reloaded = await dao.getWorkflow('atomic_test_wf', true);
      expect(reloaded).toBeDefined();
      expect(reloaded!.tasks.length).toBe(2);

      const wfFromDirect = await dao.getWorkflow('atomic_test_wf', true);
      expect(wfFromDirect!.workflowId).toBe('atomic_test_wf');
      expect(wfFromDirect!.tasks).toHaveLength(2);
    });
  });
});
