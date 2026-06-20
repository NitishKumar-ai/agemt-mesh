import { describe, it, expect, beforeEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { Database as DbType } from '@agentmesh/common-persistence';
import { SchedulerJobService } from '../src/scheduler/SchedulerJobService.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      modified_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      workflow_id TEXT,
      correlation_id TEXT,
      json_data TEXT
    );
    CREATE TABLE queue_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      modified_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      deliver_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      queue_name TEXT,
      message_id TEXT,
      priority INTEGER,
      popped INTEGER,
      offset_time_seconds TEXT,
      payload TEXT
    );
    CREATE TABLE dashboard_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      prompt TEXT,
      interval TEXT,
      enabled INTEGER,
      next_run_at INTEGER,
      last_run_at INTEGER,
      last_status TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  return new Kysely<DbType>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}

describe('SchedulerJobService', () => {
  let db: Kysely<DbType>;
  let service: SchedulerJobService;

  beforeEach(() => {
    db = createTestDb();
    service = new SchedulerJobService(db as never);
  });

  it('deletes stale workflows', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .insertInto('workflow')
      .values({
        workflow_id: 'wf-1',
        correlation_id: null,
        json_data: '{}',
        created_on: oldDate,
        modified_on: oldDate,
      })
      .execute();

    const result = await service.dispatch('cleanup:executions');
    if (!result.success) console.error(result.error);
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
  });

  it('deletes stale queue messages', async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .insertInto('queue_message')
      .values({
        queue_name: 'q',
        message_id: 'm-1',
        priority: 1,
        popped: 0,
        offset_time_seconds: null,
        payload: null,
        created_on: oldDate,
        modified_on: oldDate,
        deliver_on: oldDate,
      })
      .execute();

    const result = await service.dispatch('cleanup:queue');
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
  });

  it('flags stuck schedules as timeout', async () => {
    const staleLastRun = Date.now() - 31 * 60 * 1000;
    await db
      .insertInto('dashboard_schedules')
      .values({
        name: 'stuck',
        prompt: 'cleanup:executions',
        interval: '60000',
        enabled: 1,
        next_run_at: null,
        last_run_at: staleLastRun,
        last_status: 'RUNNING',
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .execute();

    const result = await service.dispatch('cleanup:schedules');
    expect(result.success).toBe(true);
    expect(result.reset).toBe(1);
  });

  it('returns an error for unknown cleanup jobs', async () => {
    const result = await service.dispatch('cleanup:unknown');
    expect(result.success).toBe(false);
  });
});
