import DatabaseDriver from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { PermissionsMigration, IdentityMigration } from '@agentmesh/common-persistence';
import { SqliteIdentityDAO } from '../src/SQLiteIdentityDAO.js';
import { SqliteUserAccessGrantDAO } from '../src/SQLiteUserAccessGrantDAO.js';

const TENANT = 'tenant-1';

describe('SqliteIdentityDAO', () => {
  let db: Kysely<Database>;
  let dao: SqliteIdentityDAO;
  let grants: SqliteUserAccessGrantDAO;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
    });
    await PermissionsMigration.up(db);
    await IdentityMigration.up(db);
    dao = new SqliteIdentityDAO(db);
    grants = new SqliteUserAccessGrantDAO(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('migration is reversible (up then down)', async () => {
    await IdentityMigration.down(db);
    // Re-running up after down should succeed.
    await IdentityMigration.up(db);
  });

  it('fails closed when the principal has no active membership', async () => {
    await dao.upsertPrincipal({ id: 'u1', tenantId: TENANT, principalType: 'user' });
    const access = await dao.resolveEffectiveAccess(TENANT, 'u1');
    expect(access.isMember).toBe(false);
    expect(access.isAdmin).toBe(false);
    expect(access.permissionHashes).toEqual([]);
  });

  it('unions direct grants with group-inherited grants for a member', async () => {
    await dao.upsertPrincipal({ id: 'u1', tenantId: TENANT, principalType: 'user' });
    await dao.addMembership(TENANT, 'u1');

    // Direct grant via legacy user_access_grants.
    await grants.saveUserAccessGrant({
      tenantId: TENANT,
      userId: 'u1',
      permissionHash: 'direct-hash',
      isAdmin: false,
    });

    // Group grant.
    await dao.upsertGroup({ id: 'g1', tenantId: TENANT, name: 'Engineering' });
    await dao.addGroupMember(TENANT, 'g1', 'u1');
    await dao.grantGroupPermission(TENANT, 'g1', 'group-hash');

    const access = await dao.resolveEffectiveAccess(TENANT, 'u1');
    expect(access.isMember).toBe(true);
    expect(access.permissionHashes.sort()).toEqual(['direct-hash', 'group-hash']);
  });

  it('reflects group membership removal without recreating the DAO', async () => {
    await dao.upsertPrincipal({ id: 'u1', tenantId: TENANT, principalType: 'user' });
    await dao.addMembership(TENANT, 'u1');
    await dao.upsertGroup({ id: 'g1', tenantId: TENANT, name: 'Engineering' });
    await dao.addGroupMember(TENANT, 'g1', 'u1');
    await dao.grantGroupPermission(TENANT, 'g1', 'group-hash');

    expect((await dao.resolveEffectiveAccess(TENANT, 'u1')).permissionHashes).toContain('group-hash');

    await dao.removeGroupMember(TENANT, 'g1', 'u1');
    expect((await dao.resolveEffectiveAccess(TENANT, 'u1')).permissionHashes).not.toContain('group-hash');
  });

  it('reflects membership revocation immediately (fail-closed)', async () => {
    await dao.upsertPrincipal({ id: 'u1', tenantId: TENANT, principalType: 'user' });
    await dao.addMembership(TENANT, 'u1');
    await grants.saveUserAccessGrant({
      tenantId: TENANT,
      userId: 'u1',
      permissionHash: 'direct-hash',
      isAdmin: false,
    });
    expect((await dao.resolveEffectiveAccess(TENANT, 'u1')).isMember).toBe(true);

    await dao.removeMembership(TENANT, 'u1');
    const access = await dao.resolveEffectiveAccess(TENANT, 'u1');
    expect(access.isMember).toBe(false);
    expect(access.permissionHashes).toEqual([]);
  });

  it('grants admin via role', async () => {
    await dao.upsertPrincipal({ id: 'admin1', tenantId: TENANT, principalType: 'user' });
    await dao.addMembership(TENANT, 'admin1');
    await dao.assignRole(TENANT, 'admin1', 'admin');
    const access = await dao.resolveEffectiveAccess(TENANT, 'admin1');
    expect(access.isAdmin).toBe(true);
    expect(access.roles).toContain('admin');
  });

  it('refuses to grant admin role to a service identity', async () => {
    await dao.upsertPrincipal({ id: 'svc1', tenantId: TENANT, principalType: 'service' });
    await dao.addMembership(TENANT, 'svc1');
    await expect(dao.assignRole(TENANT, 'svc1', 'admin')).rejects.toThrow();

    const access = await dao.resolveEffectiveAccess(TENANT, 'svc1');
    expect(access.isAdmin).toBe(false);
  });

  it('resolves a principal by external subject within a tenant', async () => {
    await dao.upsertPrincipal({
      id: 'u1',
      tenantId: TENANT,
      principalType: 'user',
      externalSubject: 'oidc-sub-123',
      email: 'u1@example.com',
    });
    const found = await dao.getPrincipalBySubject(TENANT, 'oidc-sub-123');
    expect(found?.id).toBe('u1');
    expect(found?.email).toBe('u1@example.com');

    const missing = await dao.getPrincipalBySubject('other-tenant', 'oidc-sub-123');
    expect(missing).toBeUndefined();
  });
});
