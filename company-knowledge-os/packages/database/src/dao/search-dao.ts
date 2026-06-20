import { Kysely, sql } from 'kysely';
import { IFact, IEpisode } from '@company-knowledge-os/core';
import { Database, SearchIndexTable } from '../schema/schema';

export class SearchDAO {
  constructor(private db: Kysely<Database>) {}

  async indexFact(fact: IFact, embedding: number[]): Promise<void> {
    await this.db
      .insertInto('search_index')
      .values({
        id: fact.fact_id,
        tenant_id: fact.tenant_id,
        fact_id: fact.fact_id,
        episode_id: null,
        embedding,
        content: `${fact.subject} ${fact.predicate} ${fact.object}`,
        metadata: {
          fact_id: fact.fact_id,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          confidence: fact.confidence,
          status: fact.status,
        },
        created_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['id', 'tenant_id']).doUpdateSet({
          embedding,
          content: `${fact.subject} ${fact.predicate} ${fact.object}`,
          metadata: {
            fact_id: fact.fact_id,
            subject: fact.subject,
            predicate: fact.predicate,
            object: fact.object,
            confidence: fact.confidence,
            status: fact.status,
          },
          created_at: new Date(),
        })
      )
      .execute();
  }

  async indexEpisode(episode: IEpisode, embedding: number[]): Promise<void> {
    await this.db
      .insertInto('search_index')
      .values({
        id: episode.episode_id,
        tenant_id: episode.tenant_id,
        fact_id: null,
        episode_id: episode.episode_id,
        embedding,
        content: JSON.stringify(episode.parsed_content || {}),
        metadata: {
          episode_id: episode.episode_id,
          source_system: episode.source_system,
          source_id: episode.source_id,
          author: episode.author || null,
        },
        created_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['id', 'tenant_id']).doUpdateSet({
          embedding,
          content: JSON.stringify(episode.parsed_content || {}),
          metadata: {
            episode_id: episode.episode_id,
            source_system: episode.source_system,
            source_id: episode.source_id,
            author: episode.author || null,
          },
          created_at: new Date(),
        })
      )
      .execute();
  }

  async searchSemantic(
    tenantId: string,
    queryEmbedding: number[],
    filters?: {
      fact_id?: string;
      episode_id?: string;
      metadata?: Record<string, unknown>;
      limit?: number;
    }
  ): Promise<Array<{ id: string; fact_id?: string; episode_id?: string; score: number; content: string }>> {
    const limit = filters?.limit || 10;

    let query = this.db
      .selectFrom('search_index')
      .where('tenant_id', '=', tenantId);

    if (filters?.fact_id) {
      query = query.where('fact_id', '=', filters.fact_id);
    }

    if (filters?.episode_id) {
      query = query.where('episode_id', '=', filters.episode_id);
    }

    const results = await query
      .select((eb) => [
        'id',
        'fact_id',
        'episode_id',
        sql<number>`1 - (embedding <=> ${'[' + queryEmbedding.join(',') + ']'}::vector)`.as('score'),
        'content',
      ])
      .orderBy('score', 'desc')
      .limit(limit)
      .execute();

    return results.map((result) => ({
      id: result.id,
      fact_id: result.fact_id || undefined,
      episode_id: result.episode_id || undefined,
      score: Number(result.score),
      content: result.content,
    }));
  }

  async searchFullText(
    tenantId: string,
    query: string,
    filters?: {
      fact_id?: string;
      episode_id?: string;
      status?: string[];
      limit?: number;
    }
  ): Promise<Array<{ id: string; fact_id?: string; episode_id?: string; score: number; content: string }>> {
    const limit = filters?.limit || 10;

    let queryBuilder = this.db
      .selectFrom('search_index')
      .where('tenant_id', '=', tenantId)
      .select([
        'id',
        'fact_id',
        'episode_id',
        sql<number>`ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query}))`.as('score'),
        'content',
      ]);

    if (filters?.fact_id) {
      queryBuilder = queryBuilder.where('fact_id', '=', filters.fact_id);
    }

    if (filters?.episode_id) {
      queryBuilder = queryBuilder.where('episode_id', '=', filters.episode_id);
    }

    queryBuilder = queryBuilder
      .orderBy('score', 'desc')
      .limit(limit);

    const statusFilters = filters?.status;
    if (statusFilters && statusFilters.length > 0) {
      queryBuilder = queryBuilder.where(sql`metadata->>'status'`, 'in', statusFilters);
    }

    const results = await queryBuilder.execute();

    return results.map((result) => ({
      id: result.id,
      fact_id: result.fact_id || undefined,
      episode_id: result.episode_id || undefined,
      score: Number(result.score),
      content: result.content,
    }));
  }

  async hybridSearch(
    tenantId: string,
    queryEmbedding: number[],
    fullTextQuery: string,
    filters?: {
      fact_id?: string;
      episode_id?: string;
      limit?: number;
    }
  ): Promise<Array<{ id: string; fact_id?: string; episode_id?: string; score: number; content: string }>> {
    const limit = filters?.limit || 10;

    const [semanticResults, fullTextResults] = await Promise.all([
      this.searchSemantic(tenantId, queryEmbedding, filters),
      this.searchFullText(tenantId, fullTextQuery, filters),
    ]);

    const merged = new Map<string, { id: string; fact_id?: string; episode_id?: string; score: number; content: string }>();

    const rrfK = 60;

    for (const result of semanticResults) {
      const currentScore = merged.has(result.id) ? merged.get(result.id)!.score : 0;
      const newScore = (1 / (rrfK + 1)) + currentScore;
      merged.set(result.id, { ...result, score: newScore });
    }

    for (const result of fullTextResults) {
      const currentScore = merged.has(result.id) ? merged.get(result.id)!.score : 0;
      const newScore = (1 / (rrfK + 1)) + currentScore;
      merged.set(result.id, { ...result, score: newScore });
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async deleteIndex(id: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('search_index')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}