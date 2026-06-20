import { Kysely } from 'kysely';
import { IEpisode } from '@company-knowledge-os/core';
import { Database, EpisodeTable } from '../schema/schema';

export class EpisodeDAO {
  constructor(private db: Kysely<Database>) {}

  async createEpisode(episode: Omit<IEpisode, 'ingested_at'>): Promise<IEpisode> {
    const result = await this.db
      .insertInto('episodes')
      .values({
        ...episode,
        ingested_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...result,
      parsed_hash: result.parsed_hash ?? undefined,
      parsed_content: (result.parsed_content as any) ?? undefined,
      author: result.author ?? undefined,
      created_at: new Date(result.created_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async getEpisodeById(episodeId: string): Promise<IEpisode | null> {
    const result = await this.db
      .selectFrom('episodes')
      .where('episode_id', '=', episodeId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      parsed_hash: result.parsed_hash ?? undefined,
      parsed_content: (result.parsed_content as any) ?? undefined,
      author: result.author ?? undefined,
      created_at: new Date(result.created_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async listEpisodes(
    tenantId: string,
    filters?: {
      source_system?: string[];
      source_id?: string;
      date_range?: { start: Date; end: Date };
      limit?: number;
    }
  ): Promise<IEpisode[]> {
    let query = this.db.selectFrom('episodes').where('tenant_id', '=', tenantId);

    if (filters?.source_system && filters.source_system.length > 0) {
      query = query.where('source_system', 'in', filters.source_system);
    }

    if (filters?.source_id) {
      query = query.where('source_id', '=', filters.source_id);
    }

    if (filters?.date_range) {
      query = query.where('created_at', '>=', filters.date_range.start)
        .where('created_at', '<=', filters.date_range.end);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const results = await query
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return results.map((result) => ({
      ...result,
      parsed_hash: result.parsed_hash ?? undefined,
      parsed_content: (result.parsed_content as any) ?? undefined,
      author: result.author ?? undefined,
      created_at: new Date(result.created_at),
      ingested_at: new Date(result.ingested_at),
    }));
  }

  async getEpisodeBySource(
    tenantId: string,
    sourceSystem: string,
    sourceId: string
  ): Promise<IEpisode | null> {
    const result = await this.db
      .selectFrom('episodes')
      .where('tenant_id', '=', tenantId)
      .where('source_system', '=', sourceSystem)
      .where('source_id', '=', sourceId)
      .selectAll()
      .executeTakeFirst();

    if (!result) return null;

    return {
      ...result,
      parsed_hash: result.parsed_hash ?? undefined,
      parsed_content: (result.parsed_content as any) ?? undefined,
      author: result.author ?? undefined,
      created_at: new Date(result.created_at),
      ingested_at: new Date(result.ingested_at),
    };
  }

  async deleteEpisode(episodeId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('episodes')
      .where('episode_id', '=', episodeId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async countEpisodes(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom('episodes')
      .where('tenant_id', '=', tenantId)
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}