import { Kysely } from 'kysely';
import { IFact } from '@company-knowledge-os/core';
import { Database, FactTable } from '../schema/schema';

export class FactDAO {
  constructor(private db: Kysely<Database>) {}

  async createFact(fact: Omit<IFact, 'ingested_at'>): Promise<IFact> {
    const result = await this.db
      .insertInto('facts')
      .values({
        ...fact,
        ingested_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...result,
      ingested_at: new Date(result.ingested_at),
      observed_at: new Date(result.observed_at),
      valid_from: new Date(result.valid_from),
      valid_to: result.valid_to ? new Date(result.valid_to) : null,
      superseded_by: result.superseded_by || null,
    };
  }

  async getFactById(factId: string): Promise<IFact | null> {
    const result = await this.db
      .selectFrom('facts')
      .where('fact_id', '=', factId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      ingested_at: new Date(result.ingested_at),
      observed_at: new Date(result.observed_at),
      valid_from: new Date(result.valid_from),
      valid_to: result.valid_to ? new Date(result.valid_to) : null,
      superseded_by: result.superseded_by || null,
    };
  }

  async listFacts(
    tenantId: string,
    filters?: {
      status?: string[];
      subject?: string[];
      predicate?: string[];
      date_range?: { start: Date; end: Date };
      limit?: number;
    }
  ): Promise<IFact[]> {
    let query = this.db.selectFrom('facts').where('tenant_id', '=', tenantId);

    if (filters?.status && filters.status.length > 0) {
      query = query.where('status', 'in', filters.status as any);
    }

    if (filters?.subject && filters.subject.length > 0) {
      query = query.where('subject', 'in', filters.subject);
    }

    if (filters?.predicate && filters.predicate.length > 0) {
      query = query.where('predicate', 'in', filters.predicate);
    }

    if (filters?.date_range) {
      query = query.where('valid_from', '>=', filters.date_range.start)
        .where('valid_from', '<=', filters.date_range.end);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const results = await query
      .selectAll()
      .orderBy('valid_from', 'desc')
      .execute();

    return results.map((result) => ({
      ...result,
      ingested_at: new Date(result.ingested_at),
      observed_at: new Date(result.observed_at),
      valid_from: new Date(result.valid_from),
      valid_to: result.valid_to ? new Date(result.valid_to) : null,
      superseded_by: result.superseded_by || null,
    }));
  }

  async getActiveFacts(tenantId: string): Promise<IFact[]> {
    const results = await this.db
      .selectFrom('facts')
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .where('valid_to', 'is', null)
      .selectAll()
      .orderBy('valid_from', 'desc')
      .execute();

    return results.map((result) => ({
      ...result,
      ingested_at: new Date(result.ingested_at),
      observed_at: new Date(result.observed_at),
      valid_from: new Date(result.valid_from),
      valid_to: result.valid_to ? new Date(result.valid_to) : null,
      superseded_by: result.superseded_by || null,
    }));
  }

  async deleteFact(factId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('facts')
      .where('fact_id', '=', factId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async updateFactStatus(
    factId: string,
    status: IFact['status'],
    supersededBy?: string
  ): Promise<IFact | null> {
    const result = await this.db
      .updateTable('facts')
      .set({
        status,
        superseded_by: supersededBy || null,
        valid_to: status === 'superseded' ? new Date() : null,
      })
      .where('fact_id', '=', factId)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      ingested_at: new Date(result.ingested_at),
      observed_at: new Date(result.observed_at),
      valid_from: new Date(result.valid_from),
      valid_to: result.valid_to ? new Date(result.valid_to) : null,
      superseded_by: result.superseded_by || null,
    };
  }

  async countFacts(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom('facts')
      .where('tenant_id', '=', tenantId)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}