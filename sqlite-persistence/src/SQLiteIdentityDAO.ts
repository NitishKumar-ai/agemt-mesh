import { Kysely } from 'kysely';
import {
  IdentityDAO,
  Principal,
  Group,
  EffectiveAccess,
  ADMIN_ROLE,
  Database,
} from '@agentmesh/common-persistence';

export class SqliteIdentityDAO implements IdentityDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async upsertPrincipal(principal: Principal): Promise<Principal> {
    const existing = await this.db
      .selectFrom('principals')
      .selectAll()
      .where('id', '=', principal.id)
      .executeTakeFirst();

    const row = {
      id: principal.id,
      tenant_id: principal.tenantId,
      principal_type: principal.principalType,
      external_subject: principal.externalSubject ?? null,
      email: principal.email ?? null,
      display_name: principal.displayName ?? null,
      status: principal.status ?? 'active',
      created_at: principal.createdAt ?? Date.now(),
    };

    if (existing) {
      await this.db
        .updateTable('principals')
        .set({
          tenant_id: row.tenant_id,
          principal_type: row.principal_type,
          external_subject: row.external_subject,
          email: row.email,
          display_name: row.display_name,
          status: row.status,
        })
        .where('id', '=', principal.id)
        .execute();
    } else {
      await this.db.insertInto('principals').values(row).execute();
    }

    return { ...principal, status: row.status, createdAt: row.created_at };
  }

  async getPrincipalById(tenantId: string, principalId: string): Promise<Principal | undefined> {
    const row = await this.db
      .selectFrom('principals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', principalId)
      .executeTakeFirst();
    return row ? this.mapPrincipal(row) : undefined;
  }

  async getPrincipalBySubject(
    tenantId: string,
    externalSubject: string,
  ): Promise<Principal | undefined> {
    const row = await this.db
      .selectFrom('principals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('external_subject', '=', externalSubject)
      .executeTakeFirst();
    return row ? this.mapPrincipal(row) : undefined;
  }

  async addMembership(tenantId: string, principalId: string): Promise<void> {
    const existing = await this.db
      .selectFrom('tenant_memberships')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable('tenant_memberships')
        .set({ status: 'active' })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await this.db
        .insertInto('tenant_memberships')
        .values({
          tenant_id: tenantId,
          principal_id: principalId,
          status: 'active',
          created_at: Date.now(),
        })
        .execute();
    }
  }

  async removeMembership(tenantId: string, principalId: string): Promise<void> {
    await this.db
      .updateTable('tenant_memberships')
      .set({ status: 'removed' })
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .execute();
  }

  async isActiveMember(tenantId: string, principalId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('tenant_memberships')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    return !!row;
  }

  async assignRole(tenantId: string, principalId: string, role: string): Promise<void> {
    if (role === ADMIN_ROLE) {
      const principal = await this.getPrincipalById(tenantId, principalId);
      if (principal?.principalType === 'service') {
        throw new Error(
          `Cannot assign '${ADMIN_ROLE}' role to a service identity (${principalId}); ` +
            'service identities are separate from human tenant administrators.',
        );
      }
    }

    const existing = await this.db
      .selectFrom('principal_roles')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .where('role', '=', role)
      .executeTakeFirst();
    if (existing) return;

    await this.db
      .insertInto('principal_roles')
      .values({ tenant_id: tenantId, principal_id: principalId, role, created_at: Date.now() })
      .execute();
  }

  async removeRole(tenantId: string, principalId: string, role: string): Promise<void> {
    await this.db
      .deleteFrom('principal_roles')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .where('role', '=', role)
      .execute();
  }

  async getRoles(tenantId: string, principalId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('principal_roles')
      .select('role')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .execute();
    return rows.map((r) => r.role);
  }

  async upsertGroup(group: Group): Promise<Group> {
    const existing = await this.db
      .selectFrom('groups')
      .select('id')
      .where('id', '=', group.id)
      .executeTakeFirst();
    const createdAt = group.createdAt ?? Date.now();
    if (existing) {
      await this.db
        .updateTable('groups')
        .set({ tenant_id: group.tenantId, name: group.name })
        .where('id', '=', group.id)
        .execute();
    } else {
      await this.db
        .insertInto('groups')
        .values({ id: group.id, tenant_id: group.tenantId, name: group.name, created_at: createdAt })
        .execute();
    }
    return { ...group, createdAt };
  }

  async addGroupMember(tenantId: string, groupId: string, principalId: string): Promise<void> {
    const existing = await this.db
      .selectFrom('group_memberships')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('group_id', '=', groupId)
      .where('principal_id', '=', principalId)
      .executeTakeFirst();
    if (existing) return;
    await this.db
      .insertInto('group_memberships')
      .values({ tenant_id: tenantId, group_id: groupId, principal_id: principalId, created_at: Date.now() })
      .execute();
  }

  async removeGroupMember(tenantId: string, groupId: string, principalId: string): Promise<void> {
    await this.db
      .deleteFrom('group_memberships')
      .where('tenant_id', '=', tenantId)
      .where('group_id', '=', groupId)
      .where('principal_id', '=', principalId)
      .execute();
  }

  async getGroupsForPrincipal(tenantId: string, principalId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('group_memberships')
      .select('group_id')
      .where('tenant_id', '=', tenantId)
      .where('principal_id', '=', principalId)
      .execute();
    return rows.map((r) => r.group_id);
  }

  async grantGroupPermission(tenantId: string, groupId: string, permissionHash: string): Promise<void> {
    const existing = await this.db
      .selectFrom('group_access_grants')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('group_id', '=', groupId)
      .where('permission_hash', '=', permissionHash)
      .executeTakeFirst();
    if (existing) return;
    await this.db
      .insertInto('group_access_grants')
      .values({ tenant_id: tenantId, group_id: groupId, permission_hash: permissionHash, created_at: Date.now() })
      .execute();
  }

  async revokeGroupPermission(tenantId: string, groupId: string, permissionHash: string): Promise<void> {
    await this.db
      .deleteFrom('group_access_grants')
      .where('tenant_id', '=', tenantId)
      .where('group_id', '=', groupId)
      .where('permission_hash', '=', permissionHash)
      .execute();
  }

  async resolveEffectiveAccess(tenantId: string, principalId: string): Promise<EffectiveAccess> {
    const empty: EffectiveAccess = {
      isMember: false,
      isAdmin: false,
      roles: [],
      permissionHashes: [],
    };

    // Fail closed: no active membership means no access at all.
    if (!(await this.isActiveMember(tenantId, principalId))) {
      return empty;
    }

    const roles = await this.getRoles(tenantId, principalId);
    const isAdmin = roles.includes(ADMIN_ROLE);

    // Direct grants (legacy user_access_grants keyed by user_id == principalId).
    const directRows = await this.db
      .selectFrom('user_access_grants')
      .select(['permission_hash', 'is_admin'])
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', principalId)
      .execute();

    const directAdmin = directRows.some((r) => Number(r.is_admin) === 1);
    const hashes = new Set<string>();
    for (const r of directRows) {
      if (r.permission_hash) hashes.add(r.permission_hash);
    }

    // Group-inherited grants.
    const groupIds = await this.getGroupsForPrincipal(tenantId, principalId);
    if (groupIds.length > 0) {
      const groupGrantRows = await this.db
        .selectFrom('group_access_grants')
        .select('permission_hash')
        .where('tenant_id', '=', tenantId)
        .where('group_id', 'in', groupIds)
        .execute();
      for (const r of groupGrantRows) {
        if (r.permission_hash) hashes.add(r.permission_hash);
      }
    }

    return {
      isMember: true,
      isAdmin: isAdmin || directAdmin,
      roles,
      permissionHashes: Array.from(hashes),
    };
  }

  private mapPrincipal(row: {
    id: string;
    tenant_id: string;
    principal_type: string;
    external_subject: string | null;
    email: string | null;
    display_name: string | null;
    status: string;
    created_at: number | bigint;
  }): Principal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      principalType: row.principal_type === 'service' ? 'service' : 'user',
      externalSubject: row.external_subject,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      createdAt: Number(row.created_at),
    };
  }
}
