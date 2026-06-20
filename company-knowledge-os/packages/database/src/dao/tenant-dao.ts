import { Kysely } from 'kysely';
import { ITenant } from '@company-knowledge-os/core';
import { Database, TenantTable } from '../schema/schema';

export class TenantDAO {
  constructor(private db: Kysely<Database>) {}

  async createTenant(tenant: Omit<ITenant, 'created_at' | 'updated_at'>): Promise<ITenant> {
    const result = await this.db
      .insertInto('tenants')
      .values({
        tenant_id: tenant.tenant_id,
        name: tenant.name,
        region: tenant.region ?? null,
        policy_profile: tenant.policy_profile ?? null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...result,
      region: result.region ?? undefined,
      policy_profile: (result.policy_profile as any) ?? undefined,
      created_at: new Date(result.created_at),
      updated_at: result.updated_at ? new Date(result.updated_at) : undefined,
    };
  }

  async getTenantById(tenantId: string): Promise<ITenant | null> {
    const result = await this.db
      .selectFrom('tenants')
      .where('tenant_id', '=', tenantId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      region: result.region ?? undefined,
      policy_profile: (result.policy_profile as any) ?? undefined,
      created_at: new Date(result.created_at),
      updated_at: result.updated_at ? new Date(result.updated_at) : undefined,
    };
  }

  async listTenants(): Promise<ITenant[]> {
    const results = await this.db
      .selectFrom('tenants')
      .selectAll()
      .execute();

    return results.map((result) => ({
      ...result,
      region: result.region ?? undefined,
      policy_profile: (result.policy_profile as any) ?? undefined,
      created_at: new Date(result.created_at),
      updated_at: result.updated_at ? new Date(result.updated_at) : undefined,
    }));
  }

  async updateTenant(
    tenantId: string,
    updates: Partial<Omit<ITenant, 'tenant_id' | 'created_at' | 'updated_at'>>
  ): Promise<ITenant | null> {
    const result = await this.db
      .updateTable('tenants')
      .set({
        name: updates.name,
        region: updates.region ?? undefined,
        policy_profile: updates.policy_profile ?? undefined,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      region: result.region ?? undefined,
      policy_profile: (result.policy_profile as any) ?? undefined,
      created_at: new Date(result.created_at),
      updated_at: result.updated_at ? new Date(result.updated_at) : undefined,
    };
  }

  async deleteTenant(tenantId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('tenants')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }
}