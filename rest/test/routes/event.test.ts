import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteMetadataDAO } from '@conductor/sqlite-persistence';
import { EventService } from '../../src/services/EventService.js';
import { createEventRouter } from '../../src/routes/event.js';
import { EventActionType } from '@conductor/common';

const sampleHandler = {
  name: 'test_handler',
  event: 'test_event',
  active: true,
  actions: [
    {
      action: EventActionType.START_WORKFLOW,
      start_workflow: { name: 'test_wf', version: 1, input: {} },
    },
  ],
};

const sampleHandler2 = {
  name: 'test_handler_2',
  event: 'test_event_2',
  active: true,
  actions: [
    {
      action: EventActionType.COMPLETE_TASK,
      complete_task: { taskRefName: 't1' },
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('Event API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let app: express.Application;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const dao = new SqliteMetadataDAO(db);
    const service = new EventService(dao);
    app = express();
    app.use(express.json());
    app.use('/api', createEventRouter(service));
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('POST /api/event registers an event handler', async () => {
    const res = await request(app).post('/api/event').send(sampleHandler);
    expect(res.status).toBe(204);
  });

  it('GET /api/event lists all event handlers', async () => {
    const res = await request(app).get('/api/event');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('test_handler');
  });

  it('GET /api/event/:event filters by event', async () => {
    const res = await request(app).get('/api/event/test_event');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('test_handler');
  });

  it('PUT /api/event updates an event handler', async () => {
    const updated = { ...sampleHandler, event: 'test_event_updated' };
    const res = await request(app).put('/api/event').send(updated);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/event/:name removes an event handler', async () => {
    const res = await request(app).delete('/api/event/test_handler');
    expect(res.status).toBe(204);
  });

  it('GET /api/event returns empty after deletion', async () => {
    const res = await request(app).get('/api/event');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('POST registers a second event handler', async () => {
    await request(app).post('/api/event').send(sampleHandler2);
    const res = await request(app).get('/api/event');
    expect(res.body).toHaveLength(1);
  });
});
