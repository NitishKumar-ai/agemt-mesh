import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteMetadataDAO } from '@conductor/sqlite-persistence';
import { MetadataService } from '../../src/services/MetadataService.js';
import { createMetadataRouter } from '../../src/routes/metadata.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('Metadata API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let app: express.Application;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const dao = new SqliteMetadataDAO(db);
    const service = new MetadataService(dao);
    app = express();
    app.use(express.json());
    app.use('/api', createMetadataRouter(service));
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('POST /api/metadata/workflow registers a workflow def', async () => {
    const res = await request(app)
      .post('/api/metadata/workflow')
      .send({ name: 'route_test_wf', version: 1, ownerEmail: 'test@example.com', tasks: [{ name: 't1', taskReferenceName: 't1', type: 'SIMPLE' }] });
    expect(res.status).toBe(201);
  });

  it('DELETE /api/metadata/workflow/:name/:version removes a workflow def', async () => {
    const res = await request(app).delete('/api/metadata/workflow/route_test_wf/1');
    expect(res.status).toBe(204);
  });

  it('GET /api/metadata/workflow lists all workflow defs', async () => {
    const res = await request(app).get('/api/metadata/workflow');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/metadata/taskdefs registers task defs', async () => {
    const res = await request(app)
      .post('/api/metadata/taskdefs')
      .send([{ name: 'route_task', ownerEmail: 'test@example.com', timeoutSeconds: 300 }]);
    expect(res.status).toBe(201);
  });

  it('GET /api/metadata/taskdefs lists all task defs', async () => {
    const res = await request(app).get('/api/metadata/taskdefs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/metadata/taskdefs/:tasktype returns a task def', async () => {
    const res = await request(app).get('/api/metadata/taskdefs/route_task');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('route_task');
  });

  it('DELETE /api/metadata/taskdefs/:tasktype removes a task def', async () => {
    const res = await request(app).delete('/api/metadata/taskdefs/route_task');
    expect(res.status).toBe(204);
  });
});
