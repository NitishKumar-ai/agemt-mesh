import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO, SqlitePollDataDAO } from '@conductor/sqlite-persistence';
import { TaskService } from '../../src/services/TaskService.js';
import { createTaskRouter } from '../../src/routes/tasks.js';
import { TaskStatus } from '@conductor/common';
import type { TaskModel } from '@conductor/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('Task API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let executionDAO: any;
  let app: express.Application;

  const sampleTask: TaskModel = {
    taskId: 'route-task-1',
    workflowInstanceId: 'route-wf-1',
    taskType: 'route_test_task',
    referenceTaskName: 't1',
    status: TaskStatus.IN_PROGRESS,
    inputData: {},
    outputData: {},
    startTime: Date.now(),
  } as TaskModel;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    const pollDataDAO = new SqlitePollDataDAO(db);
    const service = new TaskService(executionDAO, queueDAO, metadataDAO, pollDataDAO);
    app = express();
    app.use(express.json());
    app.use('/api', createTaskRouter(service));
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

  it('GET /api/tasks/poll/:tasktype returns 200 (no task)', async () => {
    const res = await request(app).get('/api/tasks/poll/route_test_task');
    expect(res.status).toBe(204);
  });

  it('GET /api/tasks/poll/batch/:tasktype returns empty array', async () => {
    const res = await request(app).get('/api/tasks/poll/batch/route_test_task');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/tasks/:taskId returns 404 for unknown task', async () => {
    const res = await request(app).get('/api/tasks/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /api/tasks/:taskId returns task when found', async () => {
    await executionDAO.createTasks([sampleTask]);

    const res = await request(app).get('/api/tasks/route-task-1');
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe('route-task-1');
  });

  it('POST /api/tasks updates a task', async () => {
    await executionDAO.createTasks([sampleTask]);

    const taskType = 'route_test_task';
    await db
      .insertInto('queue_message')
      .values({
        queue_name: taskType,
        message_id: sampleTask.taskId,
        priority: 0,
        popped: 0,
        offset_time_seconds: '0',
        deliver_on: sql`datetime('now')`,
      })
      .execute();

    const res = await request(app)
      .post('/api/tasks')
      .send({
        workflowInstanceId: sampleTask.workflowInstanceId,
        taskId: sampleTask.taskId,
        status: TaskStatus.COMPLETED,
        outputData: { result: 'done' },
      });
    expect(res.status).toBe(200);
    expect(res.text).toBe(sampleTask.taskId);
  });

  it('GET /api/tasks/queue/size returns 0 for empty queue', async () => {
    const res = await request(app).get('/api/tasks/queue/size?taskType=route_test_task');
    expect(res.status).toBe(200);
    expect(res.body).toBe(0);
  });

  it('GET /api/tasks/queue/all returns queue details', async () => {
    const res = await request(app).get('/api/tasks/queue/all');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/tasks/queue/all/verbose returns detailed queue info', async () => {
    const res = await request(app).get('/api/tasks/queue/all/verbose');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/tasks/queue/polldata returns empty array', async () => {
    const res = await request(app).get('/api/tasks/queue/polldata?taskType=route_test_task');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/tasks/queue/polldata/all returns empty array', async () => {
    const res = await request(app).get('/api/tasks/queue/polldata/all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/tasks/queue/requeue/:taskType flushes the queue', async () => {
    const res = await request(app).post('/api/tasks/queue/requeue/route_test_task');
    expect(res.status).toBe(200);
    expect(res.text).toBe('true');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('GET /api/tasks/search returns search result', async () => {
    const res = await request(app).get('/api/tasks/search');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalHits');
    expect(res.body).toHaveProperty('results');
  });

  it('GET /api/tasks/search-v2 returns search result', async () => {
    const res = await request(app).get('/api/tasks/search-v2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalHits');
    expect(res.body).toHaveProperty('results');
  });

  it('GET /api/tasks/externalstoragelocation returns stub', async () => {
    const res = await request(app).get('/api/tasks/externalstoragelocation?path=/test&operation=read&payloadType=task');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uri');
    expect(res.body).toHaveProperty('path');
  });

  it('GET /api/tasks/external-storage-location returns stub', async () => {
    const res = await request(app).get('/api/tasks/external-storage-location?path=/test&operation=read&payloadType=task');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uri');
    expect(res.body).toHaveProperty('path');
  });

  it('POST /api/tasks/update-v2 updates a task', async () => {
    await executionDAO.createTasks([sampleTask]);

    const taskType = 'route_test_task';
    await db
      .insertInto('queue_message')
      .values({
        queue_name: taskType,
        message_id: sampleTask.taskId,
        priority: 0,
        popped: 0,
        offset_time_seconds: '0',
        deliver_on: sql`datetime('now')`,
      })
      .execute();

    const res = await request(app)
      .post('/api/tasks/update-v2')
      .send({
        workflowInstanceId: sampleTask.workflowInstanceId,
        taskId: sampleTask.taskId,
        status: TaskStatus.COMPLETED,
        outputData: { result: 'done' },
      });
    expect(res.status).toBe(204);
  });

  it('POST /api/tasks/:taskId/log adds a task log', async () => {
    await executionDAO.createTasks([sampleTask]);
    const res = await request(app)
      .post('/api/tasks/route-task-1/log')
      .send({ log: 'test log message' });
    expect(res.status).toBe(200);
  });

  it('GET /api/tasks/:taskId/log returns 204 when no logs', async () => {
    const res = await request(app).get('/api/tasks/route-task-1/log');
    expect(res.status).toBe(204);
  });

  it('POST /api/tasks/:workflowId/:taskRefName/:status updates task by ref name', async () => {
    await executionDAO.createTasks([sampleTask]);

    const res = await request(app)
      .post('/api/tasks/route-wf-1/t1/COMPLETED')
      .send({ result: 'ok' });
    expect(res.status).toBe(200);
    expect(res.text).toBe(sampleTask.taskId);
  });

  it('GET /api/tasks/queue/sizes returns map for queried task types', async () => {
    const res = await request(app).get('/api/tasks/queue/sizes?taskType=route_test_task');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});
