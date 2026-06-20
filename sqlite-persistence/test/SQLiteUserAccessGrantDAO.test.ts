import DatabaseDriver from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { PermissionsMigration } from '@agentmesh/common-persistence';
import { SqliteUserAccessGrantDAO } from '../src/SQLiteUserAccessGrantDAO.js';

describe('SqliteUserAccessGrantDAO', () => {
  let db: Kysely<Database>;
  let dao: SqliteUserAccessGrantDAO;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: new DatabaseDriver(':memory:'),
      }),
    });
    // Run migration
    await PermissionsMigration.up(db);
    dao = new SqliteUserAccessGrantDAO(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('should save and retrieve user access grants', async () => {
    const grant = {
      tenantId: 'tenant-123',
      userId: 'user-456',
      permissionHash: 'sha256-hash-value',
      isAdmin: true,
    };

    const saved = await dao.saveUserAccessGrant(grant);
    expect(saved.id).toBeDefined();
    expect(saved.tenantId).toBe(grant.tenantId);
    expect(saved.userId).toBe(grant.userId);
    expect(saved.permissionHash).toBe(grant.permissionHash);
    expect(saved.isAdmin).toBe(true);
    expect(saved.createdAt).toBeDefined();

    // Save another one (not admin)
    const grant2 = {
      tenantId: 'tenant-123',
      userId: 'user-456',
      permissionHash: 'another-hash',
      isAdmin: false,
    };
    await dao.saveUserAccessGrant(grant2);

    const grants = await dao.getUserAccessGrants('tenant-123', 'user-456');
    expect(grants.length).toBe(2);
    expect(grants[0].permissionHash).toBe('sha256-hash-value');
    expect(grants[0].isAdmin).toBe(true);
    expect(grants[1].permissionHash).toBe('another-hash');
    expect(grants[1].isAdmin).toBe(false);

    // Try a non-existent tenant/user
    const emptyGrants = await dao.getUserAccessGrants('other-tenant', 'other-user');
    expect(emptyGrants.length).toBe(0);
  });
});
