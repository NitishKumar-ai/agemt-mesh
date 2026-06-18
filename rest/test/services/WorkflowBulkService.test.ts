import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@conductor/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { WorkflowBulkService } from '../../src/services/WorkflowBulkService.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('WorkflowBulkService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let bulkService: WorkflowBulkService;
  let workflowService: WorkflowService;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    workflowService = new WorkflowService(executionDAO, metadataDAO, queueDAO);
    bulkService = new WorkflowBulkService(workflowService);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('pauseWorkflow returns success for empty list', async () => {
    const result = await bulkService.pauseWorkflow([]);
    expect(result.bulkSuccessfulResults).toEqual([]);
    expect(result.bulkErrorResults).toEqual({});
  });

  it('pauseWorkflow returns error for non-existent workflow', async () => {
    const result = await bulkService.pauseWorkflow(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('resumeWorkflow returns error for non-existent workflow', async () => {
    const result = await bulkService.resumeWorkflow(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('terminate returns error for non-existent workflow', async () => {
    const result = await bulkService.terminate(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('deleteWorkflow returns error for non-existent workflow', async () => {
    const result = await bulkService.deleteWorkflow(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('restart returns error for non-existent workflow', async () => {
    const result = await bulkService.restart(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('retry returns error for non-existent workflow', async () => {
    const result = await bulkService.retry(['nonexistent']);
    expect(result.bulkErrorResults).toHaveProperty('nonexistent');
  });
});
