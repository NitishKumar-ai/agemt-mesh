import { describe, it, expect, afterEach } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PolicyEngine } from '../src/auth/PolicyEngine.js';

/**
 * T3: grants must be durable (survive restart) and shared across instances when
 * the engine is backed by a shared connection, and must union group-inherited
 * grants. The unit suite (policy-engine.test.ts) covers the standalone
 * :memory: behavior; this suite covers the durable/shared path.
 */
describe('PolicyEngine — durable, shared connection', () => {
  const tmpFiles: string[] = [];

  function tempDbPath(): string {
    const p = path.join(os.tmpdir(), `policy-${crypto.randomUUID()}.sqlite`);
    tmpFiles.push(p);
    return p;
  }

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('persists grants across a simulated restart (reopening the same file)', () => {
    const dbPath = tempDbPath();

    // First "process": grant, then close.
    const db1 = new DatabaseDriver(dbPath);
    const engine1 = new PolicyEngine(db1);
    engine1.grantAccess({ tenant_id: 'org_1', user_id: 'user_exec', permission_hashes: ['executive'] });
    db1.close();

    // Second "process": a fresh engine over a fresh connection to the same file.
    const db2 = new DatabaseDriver(dbPath);
    const engine2 = new PolicyEngine(db2);
    const access = engine2.resolveAccess('org_1', 'user_exec');
    expect(engine2.isVisible('executive', access)).toBe(true);
    db2.close();
  });

  it('shares grants across two engines on the same connection', () => {
    const db = new DatabaseDriver(tempDbPath());
    const writer = new PolicyEngine(db);
    const reader = new PolicyEngine(db);

    writer.grantAccess({ tenant_id: 'org_1', user_id: 'u1', permission_hashes: ['finance'] });
    const access = reader.resolveAccess('org_1', 'u1');
    expect(reader.isVisible('finance', access)).toBe(true);
    db.close();
  });

  it('unions group-inherited permission hashes when identity tables exist', () => {
    const db = new DatabaseDriver(tempDbPath());
    // Minimal identity tables (mirrors migration 005 for the columns used here).
    db.exec(`
      CREATE TABLE group_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL, group_id TEXT NOT NULL,
        principal_id TEXT NOT NULL, created_at BIGINT NOT NULL
      );
      CREATE TABLE group_access_grants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL, group_id TEXT NOT NULL,
        permission_hash TEXT NOT NULL, created_at BIGINT NOT NULL
      );
    `);
    db.prepare('INSERT INTO group_memberships (tenant_id, group_id, principal_id, created_at) VALUES (?,?,?,?)')
      .run('org_1', 'g_eng', 'u1', Date.now());
    db.prepare('INSERT INTO group_access_grants (tenant_id, group_id, permission_hash, created_at) VALUES (?,?,?,?)')
      .run('org_1', 'g_eng', 'eng-secret', Date.now());

    const engine = new PolicyEngine(db);
    // No direct grant, only group-inherited.
    const access = engine.resolveAccess('org_1', 'u1');
    expect(engine.isVisible('eng-secret', access)).toBe(true);
    expect(engine.isVisible('unrelated', access)).toBe(false);
    db.close();
  });
});
