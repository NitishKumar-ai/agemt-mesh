import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@agentmesh/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { AdminService } from '../../src/services/AdminService.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('AdminService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let adminService: AdminService;
  let workflowService: WorkflowService;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    workflowService = new WorkflowService(executionDAO, metadataDAO, queueDAO);
    adminService = new AdminService(workflowService, executionDAO, { testKey: { nested: 'value' } });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('getAllConfig returns config', () => {
    const config = adminService.getAllConfig();
    expect(config.testKey).toEqual({ nested: 'value' });
  });

  it('getListOfPendingTask returns empty for unknown task type', async () => {
    const tasks = await adminService.getListOfPendingTask('nonexistent_task');
    expect(tasks).toEqual([]);
  });

  it('requeueSweep pushes to decider queue', async () => {
    const result = await adminService.requeueSweep('test-wf-id');
    expect(result).toContain('test-wf-id');
  });

  it('verifyAndRepairWorkflowConsistency throws', async () => {
    await expect(adminService.verifyAndRepairWorkflowConsistency('any')).rejects.toThrow(
      'WorkflowRepairService is not implemented',
    );
  });

  it('getEventQueues throws', async () => {
    await expect(adminService.getEventQueues(false)).rejects.toThrow(
      'Event processing is DISABLED',
    );
  });
});
