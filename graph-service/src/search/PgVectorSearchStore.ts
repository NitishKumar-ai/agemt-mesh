import {
  VectorSearchDocument,
  VectorSearchHit,
  VectorSearchQuery,
  VectorSearchStore,
} from '@agentmesh/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

export interface PgVectorQueryClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface PgVectorConnectedClient extends PgVectorQueryClient {
  release(): void;
}

export interface PgVectorPool extends PgVectorQueryClient {
  connect(): Promise<PgVectorConnectedClient>;
  end(): Promise<void>;
}

export interface PgVectorSearchStoreOptions {
  connectionString: string;
  dimensions: number;
  provider: string;
  model: string;
  hnswEfSearch?: number;
  pool?: PgVectorPool;
}

interface SearchRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  resource_id: string;
  resource_type: string;
  content: string;
  permission_hash: string | null;
  metadata: Record<string, unknown> | string;
  score: string | number;
}

export class PgVectorSearchStore implements VectorSearchStore {
  private readonly pool: PgVectorPool;
  private readonly tableName: string;
  private readonly indexPrefix: string;
  private readonly hnswEfSearch: number;
  private initialization: Promise<void> | undefined;

  constructor(private readonly options: PgVectorSearchStoreOptions) {
    if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) {
      throw new Error('Pgvector dimensions must be a positive integer');
    }
    if (options.dimensions > 2000) {
      throw new Error('Pgvector vector indexes support at most 2000 dimensions');
    }
    this.pool =
      options.pool ??
      (new Pool({ connectionString: options.connectionString }) as unknown as PgVectorPool);
    this.tableName = `agentmesh_vector_index_${options.dimensions}`;
    this.indexPrefix = `am_vec_${options.dimensions}`;
    this.hnswEfSearch = Math.max(1, options.hnswEfSearch ?? 100);
  }

  async initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.runMigrations();
    return this.initialization;
  }

  async upsert(document: VectorSearchDocument): Promise<void> {
    await this.upsertBatch([document]);
  }

  async upsertBatch(documents: VectorSearchDocument[]): Promise<void> {
    if (documents.length === 0) return;
    await this.initialize();
    documents.forEach((document) => this.validateDocument(document));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.upsertDocuments(client, documents);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceTenant(tenantId: string, documents: VectorSearchDocument[]): Promise<void> {
    await this.initialize();
    for (const document of documents) {
      if (document.tenantId !== tenantId) {
        throw new Error('Tenant replacement cannot contain documents from another tenant');
      }
      this.validateDocument(document);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${this.tableName} WHERE tenant_id = $1`, [tenantId]);
      await this.upsertDocuments(client, documents);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.initialize();
    await this.pool.query(`DELETE FROM ${this.tableName} WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      id,
    ]);
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    await this.initialize();
    await this.pool.query(`DELETE FROM ${this.tableName} WHERE tenant_id = $1`, [tenantId]);
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchHit[]> {
    await this.initialize();
    this.validateEmbedding(query.embedding);
    const values: unknown[] = [
      this.toSqlVector(query.embedding),
      query.tenantId,
      this.options.provider,
      this.options.model,
    ];
    const conditions = ['tenant_id = $2', 'embedding_provider = $3', 'embedding_model = $4'];

    if (query.resourceTypes?.length) {
      values.push(query.resourceTypes);
      conditions.push(`resource_type = ANY($${values.length}::text[])`);
    }

    if (!query.bypassPermissions) {
      const permissionClauses: string[] = [];
      if (query.includePublic ?? true) permissionClauses.push('permission_hash IS NULL');
      if (query.allowedPermissionHashes?.length) {
        values.push(query.allowedPermissionHashes);
        permissionClauses.push(`permission_hash = ANY($${values.length}::text[])`);
      }
      conditions.push(permissionClauses.length ? `(${permissionClauses.join(' OR ')})` : 'FALSE');
    }

    values.push(query.minScore ?? -1);
    conditions.push(`1 - (embedding <=> $1::vector) >= $${values.length}`);
    values.push(Math.max(1, query.limit ?? 10));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL hnsw.ef_search = ${this.hnswEfSearch}`);
      const result = await client.query<SearchRow>(
        `SELECT id, tenant_id, resource_id, resource_type, content, permission_hash, metadata,
                1 - (embedding <=> $1::vector) AS score
           FROM ${this.tableName}
          WHERE ${conditions.join(' AND ')}
          ORDER BY embedding <=> $1::vector, id
          LIMIT $${values.length}`,
        values,
      );
      await client.query('COMMIT');
      return result.rows.map((row) => ({
        document: {
          id: row.id,
          tenantId: row.tenant_id,
          resourceId: row.resource_id,
          resourceType: row.resource_type,
          content: row.content,
          embedding: [],
          permissionHash: row.permission_hash,
          metadata:
            typeof row.metadata === 'string'
              ? (JSON.parse(row.metadata) as Record<string, unknown>)
              : row.metadata,
        },
        score: Number(row.score),
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async count(tenantId?: string): Promise<number> {
    await this.initialize();
    const result = tenantId
      ? await this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${this.tableName} WHERE tenant_id = $1`,
          [tenantId],
        )
      : await this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${this.tableName}`,
        );
    return Number(result.rows[0]?.count ?? 0);
  }

  async clear(): Promise<void> {
    await this.initialize();
    await this.pool.query(`TRUNCATE TABLE ${this.tableName}`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async runMigrations(): Promise<void> {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
         id TEXT NOT NULL,
         tenant_id TEXT NOT NULL,
         resource_id TEXT NOT NULL,
         resource_type TEXT NOT NULL,
         content TEXT NOT NULL,
         embedding vector(${this.options.dimensions}) NOT NULL,
         permission_hash TEXT NULL,
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
         embedding_provider TEXT NOT NULL,
         embedding_model TEXT NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (tenant_id, id)
       )`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_tenant_type
         ON ${this.tableName} (tenant_id, resource_type)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_permission
         ON ${this.tableName} (tenant_id, permission_hash)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_embedding_hnsw
         ON ${this.tableName} USING hnsw (embedding vector_cosine_ops)`,
    );
  }

  private async upsertDocuments(
    client: PgVectorQueryClient,
    documents: VectorSearchDocument[],
  ): Promise<void> {
    for (const document of documents) {
      await client.query(
        `INSERT INTO ${this.tableName}
          (id, tenant_id, resource_id, resource_type, content, embedding, permission_hash,
           metadata, embedding_provider, embedding_model, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb, $9, $10, NOW())
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           resource_id = EXCLUDED.resource_id,
           resource_type = EXCLUDED.resource_type,
           content = EXCLUDED.content,
           embedding = EXCLUDED.embedding,
           permission_hash = EXCLUDED.permission_hash,
           metadata = EXCLUDED.metadata,
           embedding_provider = EXCLUDED.embedding_provider,
           embedding_model = EXCLUDED.embedding_model,
           updated_at = NOW()`,
        [
          document.id,
          document.tenantId,
          document.resourceId,
          document.resourceType,
          document.content,
          this.toSqlVector(document.embedding),
          document.permissionHash,
          JSON.stringify(document.metadata),
          this.options.provider,
          this.options.model,
        ],
      );
    }
  }

  private validateDocument(document: VectorSearchDocument): void {
    if (!document.tenantId || !document.id || !document.resourceId) {
      throw new Error('Vector documents require tenant, document, and resource IDs');
    }
    this.validateEmbedding(document.embedding);
  }

  private validateEmbedding(embedding: number[]): void {
    if (
      embedding.length !== this.options.dimensions ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Embedding must contain ${this.options.dimensions} finite values`);
    }
  }

  private toSqlVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
