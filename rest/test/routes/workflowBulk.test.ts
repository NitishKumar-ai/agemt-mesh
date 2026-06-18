import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@conductor/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { WorkflowBulkService } from '../../src/services/WorkflowBulkService.js';
import { createWorkflowBulkRouter } from '../../src/routes/workflowBulk.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('WorkflowBulk API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let app: express.Application;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    const workflowService = new WorkflowService(executionDAO, metadataDAO, queueDAO);
    const bulkService = new WorkflowBulkService(workflowService);
    app = express();
    app.use(express.json());
    app.use('/api', createWorkflowBulkRouter(bulkService));
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('PUT /api/workflow/bulk/pause returns errors for nonexistent workflows', async () => {
    const res = await request(app).put('/api/workflow/bulk/pause').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('PUT /api/workflow/bulk/resume returns errors for nonexistent workflows', async () => {
    const res = await request(app).put('/api/workflow/bulk/resume').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('POST /api/workflow/bulk/terminate returns errors for nonexistent workflows', async () => {
    const res = await request(app).post('/api/workflow/bulk/terminate').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('DELETE /api/workflow/bulk/remove returns errors for nonexistent workflows', async () => {
    const res = await request(app).delete('/api/workflow/bulk/remove').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('POST /api/workflow/bulk/restart returns errors for nonexistent workflows', async () => {
    const res = await request(app).post('/api/workflow/bulk/restart').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });

  it('POST /api/workflow/bulk/retry returns errors for nonexistent workflows', async () => {
    const res = await request(app).post('/api/workflow/bulk/retry').send(['nonexistent']);
    expect(res.status).toBe(200);
    expect(res.body.bulkErrorResults).toHaveProperty('nonexistent');
  });
});
