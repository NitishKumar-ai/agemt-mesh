import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import { IEntity } from '@company-knowledge-os/core';
import { Database, EntityTable } from '../schema/schema';

export class EntityDAO {
  constructor(private db: Kysely<Database>) {}

  async createEntity(entity: Omit<IEntity, 'created_at' | 'entity_id'> & { entity_id?: string }): Promise<IEntity> {
    const entityId = entity.entity_id || randomUUID();
    const result = await this.db
      .insertInto('entities')
      .values({
        ...entity,
        entity_id: entityId,
        aliases: entity.aliases || [],
        source_refs: entity.source_refs || [],
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...result,
      aliases: result.aliases || [],
      source_refs: (result.source_refs || []) as Record<string, any>[],
      created_at: new Date(result.created_at),
    };
  }

  async getEntityById(entityId: string): Promise<IEntity | null> {
    const result = await this.db
      .selectFrom('entities')
      .where('entity_id', '=', entityId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      aliases: result.aliases || [],
      source_refs: (result.source_refs || []) as Record<string, any>[],
      created_at: new Date(result.created_at),
    };
  }

  async getEntityByName(
    tenantId: string,
    name: string,
    entityType?: string
  ): Promise<IEntity | null> {
    let query = this.db
      .selectFrom('entities')
      .where('tenant_id', '=', tenantId)
      .where('name', '=', name);

    if (entityType) {
      query = query.where('entity_type', '=', entityType);
    }

    const result = await query.selectAll().executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      aliases: result.aliases || [],
      source_refs: (result.source_refs || []) as Record<string, any>[],
      created_at: new Date(result.created_at),
    };
  }

  async listEntities(
    tenantId: string,
    filters?: {
      entity_type?: string[];
      limit?: number;
    }
  ): Promise<IEntity[]> {
    let query = this.db.selectFrom('entities').where('tenant_id', '=', tenantId);

    if (filters?.entity_type && filters.entity_type.length > 0) {
      query = query.where('entity_type', 'in', filters.entity_type);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const results = await query
      .selectAll()
      .orderBy('name', 'asc')
      .execute();

    return results.map((result) => ({
      ...result,
      aliases: result.aliases || [],
      source_refs: (result.source_refs || []) as Record<string, any>[],
      created_at: new Date(result.created_at),
    }));
  }

  async getOrCreateEntity(
    tenantId: string,
    name: string,
    entityType: string
  ): Promise<IEntity> {
    const existing = await this.getEntityByName(tenantId, name, entityType);

    if (existing) {
      return existing;
    }

    return this.createEntity({
      tenant_id: tenantId,
      name,
      entity_type: entityType,
    });
  }

  async updateEntity(
    entityId: string,
    updates: Partial<Omit<IEntity, 'entity_id' | 'tenant_id' | 'created_at'>>
  ): Promise<IEntity | null> {
    const result = await this.db
      .updateTable('entities')
      .set({
        name: updates.name,
        entity_type: updates.entity_type,
        aliases: updates.aliases,
        source_refs: updates.source_refs,
      })
      .where('entity_id', '=', entityId)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      aliases: result.aliases || [],
      source_refs: (result.source_refs || []) as Record<string, any>[],
      created_at: new Date(result.created_at),
    };
  }

  async deleteEntity(entityId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('entities')
      .where('entity_id', '=', entityId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async countEntities(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom('entities')
      .where('tenant_id', '=', tenantId)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}