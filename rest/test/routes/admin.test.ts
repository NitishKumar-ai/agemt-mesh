import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@conductor/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { AdminService } from '../../src/services/AdminService.js';
import { createAdminRouter } from '../../src/routes/admin.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('Admin API routes', () => {
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
    const adminService = new AdminService(workflowService, executionDAO, { version: '0.0.0' });
    app = express();
    app.use(express.json());
    app.use('/api', createAdminRouter(adminService));
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('GET /api/admin/config returns config', async () => {
    const res = await request(app).get('/api/admin/config');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.0.0');
  });

  it('GET /api/admin/task/:tasktype returns empty list', async () => {
    const res = await request(app).get('/api/admin/task/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/admin/sweep/requeue/:workflowId pushes to decider queue', async () => {
    const res = await request(app).post('/api/admin/sweep/requeue/test-wf');
    expect(res.status).toBe(200);
    expect(res.text).toContain('test-wf');
  });
});
