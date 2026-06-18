import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import { SqliteMetadataDAO } from '@agentmesh/sqlite-persistence';
import { EventService } from '../../src/services/EventService.js';
import { EventActionType, ConflictException, NotFoundException } from '@agentmesh/common';

const sampleHandler = {
  name: 'es_test_handler',
  event: 'es_test_event',
  active: true,
  actions: [
    {
      action: EventActionType.START_WORKFLOW,
      start_workflow: { name: 'test_wf', version: 1, input: {} },
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('EventService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: EventService;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const dao = new SqliteMetadataDAO(db);
    service = new EventService(dao);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('addEventHandler creates a new handler', async () => {
    await service.addEventHandler(sampleHandler);
    const handlers = await service.getEventHandlers();
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe('es_test_handler');
  });

  it('addEventHandler rejects duplicate names', async () => {
    await expect(service.addEventHandler(sampleHandler)).rejects.toThrow(ConflictException);
  });

  it('getEventHandlersForEvent filters by event', async () => {
    const handlers = await service.getEventHandlersForEvent('es_test_event');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].name).toBe('es_test_handler');
  });

  it('getEventHandlersForEvent respects activeOnly', async () => {
    const handlers = await service.getEventHandlersForEvent('nonexistent');
    expect(handlers).toHaveLength(0);
  });

  it('updateEventHandler modifies an existing handler', async () => {
    const updated = { ...sampleHandler, event: 'updated_event' };
    await service.updateEventHandler(updated);
    const handlers = await service.getEventHandlersForEvent('updated_event');
    expect(handlers).toHaveLength(1);
  });

  it('updateEventHandler throws on missing handler', async () => {
    const missing = { ...sampleHandler, name: 'does_not_exist' };
    await expect(service.updateEventHandler(missing)).rejects.toThrow(NotFoundException);
  });

  it('removeEventHandlerStatus removes a handler', async () => {
    await service.removeEventHandlerStatus('es_test_handler');
    const handlers = await service.getEventHandlers();
    expect(handlers).toHaveLength(0);
  });

  it('removeEventHandlerStatus throws on missing handler', async () => {
    await expect(service.removeEventHandlerStatus('does_not_exist')).rejects.toThrow(
      NotFoundException,
    );
  });
});
