import { Kysely } from 'kysely';
import { IFact } from '@company-knowledge-os/core';
import { SearchIndexTable } from '../schema/schema';

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
      .onConflictDoUpdate({
        target: ['id', 'tenant_id'],
        set: {
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
        },
      })
      .execute();
  }

  async indexEpisode(episode: IFact, embedding: number[]): Promise<void> {
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
          author: episode.author,
        },
        created_at: new Date(),
      })
      .onConflictDoUpdate({
        target: ['id', 'tenant_id'],
        set: {
          embedding,
          content: JSON.stringify(episode.parsed_content || {}),
          metadata: {
            episode_id: episode.episode_id,
            source_system: episode.source_system,
            source_id: episode.source_id,
            author: episode.author,
          },
          created_at: new Date(),
        },
      })
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

    const results = await this.db
      .selectFrom('search_index')
      .where('tenant_id', '=', tenantId)
      .where((eb) =>
        eb.and([
          eb('fact_id', 'is', filters?.fact_id ? eb.ref('fact_id').equals(filters.fact_id) : undefined),
          eb('episode_id', 'is', filters?.episode_id ? eb.ref('episode_id').equals(filters.episode_id) : undefined),
        ])
      )
      .select((eb) => [
        'id',
        'fact_id',
        'episode_id',
        eb
          .fn
          .number('pgvector')
          .withArgs('cosine_similarity', eb.ref('embedding'), queryEmbedding)
          .as('score'),
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
      .where((eb) =>
        eb.and([
          eb('fact_id', 'is', filters?.fact_id ? eb.ref('fact_id').equals(filters.fact_id) : undefined),
          eb('episode_id', 'is', filters?.episode_id ? eb.ref('episode_id').equals(filters.episode_id) : undefined),
        ])
      )
      .select((eb) => [
        'id',
        'fact_id',
        'episode_id',
        eb.fn('ts_rank', eb.ref('content'), eb.fn('plainto_tsquery', 'english', query)).as('score'),
        'content',
      ])
      .orderBy('score', 'desc')
      .limit(limit);

    if (filters?.status && filters.status.length > 0) {
      queryBuilder = queryBuilder.where((eb) =>
        eb.and(
          filters.status.map((status) => eb('metadata->>status', '=', status))
        )
      );
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