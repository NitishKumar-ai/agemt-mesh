import {
  EmbeddingProvider,
  VectorSearchDocument,
  VectorSearchHit,
  VectorSearchStore,
} from '@agentmesh/common';

export interface SearchTextOptions {
  limit?: number;
  minScore?: number;
  resourceTypes?: string[];
  allowedPermissionHashes?: string[];
  includePublic?: boolean;
  bypassPermissions?: boolean;
}

export interface ReindexReport {
  tenantId: string;
  indexed: number;
  durationMs: number;
  provider: string;
  model: string;
  dimensions: number;
}

export class VectorSearchService {
  constructor(
    private readonly embeddings: EmbeddingProvider,
    private readonly store: VectorSearchStore,
  ) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async index(document: Omit<VectorSearchDocument, 'embedding'>): Promise<void> {
    const embedding = await this.embeddings.embed(document.content, 'document');
    await this.store.upsert({ ...document, embedding });
  }

  async indexBatch(documents: Array<Omit<VectorSearchDocument, 'embedding'>>): Promise<void> {
    if (documents.length === 0) return;
    const embeddings = await this.embeddings.embedBatch(
      documents.map((document) => document.content),
      'document',
    );
    await this.store.upsertBatch(
      documents.map((document, index) => ({
        ...document,
        embedding: embeddings[index]!,
      })),
    );
  }

  async reindex(
    tenantId: string,
    documents: Array<Omit<VectorSearchDocument, 'embedding'>>,
    batchSize = 64,
  ): Promise<ReindexReport> {
    const startedAt = Date.now();
    const indexedDocuments: VectorSearchDocument[] = [];
    for (let offset = 0; offset < documents.length; offset += batchSize) {
      const batch = documents.slice(offset, offset + batchSize);
      const embeddings = await this.embeddings.embedBatch(
        batch.map((document) => document.content),
        'document',
      );
      indexedDocuments.push(
        ...batch.map((document, index) => ({
          ...document,
          embedding: embeddings[index]!,
        })),
      );
    }
    await this.store.replaceTenant(tenantId, indexedDocuments);
    return {
      tenantId,
      indexed: documents.length,
      durationMs: Date.now() - startedAt,
      provider: this.embeddings.id,
      model: this.embeddings.model,
      dimensions: this.embeddings.dimensions,
    };
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.store.delete(tenantId, id);
  }

  async search(
    tenantId: string,
    query: string,
    options: SearchTextOptions = {},
  ): Promise<VectorSearchHit[]> {
    const embedding = await this.embeddings.embed(query, 'query');
    return this.store.search({ tenantId, embedding, ...options });
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }

  async count(tenantId?: string): Promise<number> {
    return this.store.count(tenantId);
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  async getInfo(tenantId?: string): Promise<{
    provider: string;
    model: string;
    dimensions: number;
    indexedDocuments: number;
  }> {
    return {
      provider: this.embeddings.id,
      model: this.embeddings.model,
      dimensions: this.embeddings.dimensions,
      indexedDocuments: await this.store.count(tenantId),
    };
  }
}
