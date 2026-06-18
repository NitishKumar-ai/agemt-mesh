import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@conductor/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { createWorkflowRouter } from '../../src/routes/workflow.js';
import type { WorkflowDef } from '@conductor/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('Workflow API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let app: express.Application;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let metadataDAO: any;

  const sampleDef: WorkflowDef = {
    name: 'route_test_wf',
    version: 1,
    ownerEmail: 'test@example.com',
    tasks: [{ name: 'task1', taskReferenceName: 't1', type: 'SIMPLE' }],
  };

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    const service = new WorkflowService(executionDAO, metadataDAO, queueDAO);
    app = express();
    app.use(express.json());
    app.use('/api', createWorkflowRouter(service));
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db.deleteFrom('meta_workflow_def').execute();
    await db.deleteFrom('workflow').execute();
    await db.deleteFrom('task').execute();
    await db.deleteFrom('queue_message').execute();
    await db.deleteFrom('queue').execute();
    await db.deleteFrom('workflow_to_task').execute();
    await db.deleteFrom('workflow_pending').execute();
    await db.deleteFrom('workflow_def_to_workflow').execute();
    await db.deleteFrom('task_in_progress').execute();
    await db.deleteFrom('task_scheduled').execute();
    await metadataDAO.createWorkflowDef(sampleDef);
  });

  it('POST /api/workflow/:name starts a workflow by name', async () => {
    const res = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({ key: 'value' });
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
  });

  it('POST /api/workflow starts a workflow with full request body', async () => {
    const res = await request(app)
      .post('/api/workflow')
      .send({ name: 'route_test_wf', version: 1 });
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
  });

  it('GET /api/workflow/:workflowId returns a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).get(`/api/workflow/${wfId}`);
    expect(res.status).toBe(200);
    expect(res.body.workflowId).toBe(wfId);
  });

  it('GET /api/workflow/running/:name returns running workflow IDs', async () => {
    await request(app).post('/api/workflow/route_test_wf').send({});
    const res = await request(app).get('/api/workflow/running/route_test_wf');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('DELETE /api/workflow/:workflowId terminates a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).delete(`/api/workflow/${wfId}`);
    expect(res.status).toBe(204);
  });

  it('PUT /api/workflow/:workflowId/pause pauses a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).put(`/api/workflow/${wfId}/pause`);
    expect(res.status).toBe(204);
  });

  it('PUT /api/workflow/:workflowId/resume resumes a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    await request(app).put(`/api/workflow/${wfId}/pause`);
    const res = await request(app).put(`/api/workflow/${wfId}/resume`);
    expect(res.status).toBe(204);
  });

  it('GET /api/workflow/search returns empty result', async () => {
    const res = await request(app).get('/api/workflow/search');
    expect(res.status).toBe(200);
    expect(res.body.totalHits).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  it('GET /api/workflow/:workflowId/tasks returns tasks for a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).get(`/api/workflow/${wfId}/tasks`);
    expect(res.status).toBe(200);
    expect(res.body.totalHits).toBe(0);
    expect(res.body.results).toEqual([]);
  });

  it('DELETE /api/workflow/:workflowId/remove removes a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).delete(`/api/workflow/${wfId}/remove`);
    expect(res.status).toBe(204);
  });

  it('PUT /api/workflow/:workflowId/decide triggers decide', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).put(`/api/workflow/${wfId}/decide`);
    expect(res.status).toBe(204);
  });

  it('POST /api/workflow/:workflowId/rerun returns a new workflow ID', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).post(`/api/workflow/${wfId}/rerun`).send({});
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    expect(res.body).not.toBe(wfId);
  });

  it('POST /api/workflow/:workflowId/restart restarts a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).post(`/api/workflow/${wfId}/restart`);
    expect(res.status).toBe(204);
  });

  it('POST /api/workflow/:workflowId/retry retries a workflow', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).post(`/api/workflow/${wfId}/retry`);
    expect(res.status).toBe(204);
  });

  it('POST /api/workflow/:workflowId/resetcallbacks resets callbacks', async () => {
    const startRes = await request(app)
      .post('/api/workflow/route_test_wf')
      .send({});
    const wfId = startRes.body;

    const res = await request(app).post(`/api/workflow/${wfId}/resetcallbacks`);
    expect(res.status).toBe(204);
  });
});
