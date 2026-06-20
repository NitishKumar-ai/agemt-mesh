import { Kysely } from 'kysely';
import { IRelation } from '@company-knowledge-os/core';
import { Database } from '../schema/schema';

export class RelationDAO {
  constructor(private db: Kysely<Database>) {}

  async createRelation(relation: Omit<IRelation, 'ingested_at'>): Promise<IRelation> {
    const result = await this.db
      .insertInto('relations')
      .values({
        ...relation,
        ingested_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...result,
      observed_at: new Date(result.observed_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async getRelationById(relationId: string): Promise<IRelation | null> {
    const result = await this.db
      .selectFrom('relations')
      .where('relation_id', '=', relationId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      observed_at: new Date(result.observed_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async listRelations(
    tenantId: string,
    filters?: {
      relation_type?: string[];
      source_entity_id?: string;
      target_entity_id?: string;
      status?: IRelation['status'][];
      limit?: number;
    }
  ): Promise<IRelation[]> {
    let query = this.db
      .selectFrom('relations')
      .where('tenant_id', '=', tenantId);

    if (filters?.relation_type && filters.relation_type.length > 0) {
      query = query.where('relation_type', 'in', filters.relation_type);
    }

    if (filters?.source_entity_id) {
      query = query.where('source_entity_id', '=', filters.source_entity_id);
    }

    if (filters?.target_entity_id) {
      query = query.where('target_entity_id', '=', filters.target_entity_id);
    }

    if (filters?.status && filters.status.length > 0) {
      query = query.where('status', 'in', filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const results = await query
      .selectAll()
      .orderBy('observed_at', 'desc')
      .execute();

    return results.map((result) => ({
      ...result,
      observed_at: new Date(result.observed_at),
      ingested_at: new Date(result.ingested_at),
    }));
  }

  async getActiveRelations(tenantId: string): Promise<IRelation[]> {
    return this.listRelations(tenantId, { status: ['active'] });
  }

  async deleteRelation(relationId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('relations')
      .where('relation_id', '=', relationId)
      .executeTakeFirst();

    return Number(result?.numDeletedRows ?? 0n) > 0;
  }

  async updateRelationStatus(
    relationId: string,
    status: IRelation['status']
  ): Promise<IRelation | null> {
    const result = await this.db
      .updateTable('relations')
      .set({ status })
      .where('relation_id', '=', relationId)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      observed_at: new Date(result.observed_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async countRelations(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom('relations')
      .where('tenant_id', '=', tenantId)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}
