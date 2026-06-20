import { Kysely } from 'kysely';
import { UserAccessGrantDAO, UserAccessGrant, Database } from '@agentmesh/common-persistence';

export class SqliteUserAccessGrantDAO implements UserAccessGrantDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async saveUserAccessGrant(grant: UserAccessGrant): Promise<UserAccessGrant> {
    const insertObj = {
      tenant_id: grant.tenantId,
      user_id: grant.userId,
      permission_hash: grant.permissionHash,
      is_admin: grant.isAdmin ? 1 : 0,
      created_at: grant.createdAt ?? Date.now(),
    };

    const result = await this.db
      .insertInto('user_access_grants')
      .values(insertObj)
      .executeTakeFirst();

    const insertedId = result.insertId ? Number(result.insertId) : undefined;

    return {
      ...grant,
      id: insertedId ?? grant.id,
      createdAt: insertObj.created_at,
    };
  }

  async getUserAccessGrants(tenantId: string, userId: string): Promise<UserAccessGrant[]> {
    const rows = await this.db
      .selectFrom('user_access_grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      permissionHash: row.permission_hash,
      isAdmin: row.is_admin === 1,
      createdAt: Number(row.created_at),
    }));
  }
}
