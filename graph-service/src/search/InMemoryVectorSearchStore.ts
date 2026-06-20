import {
  VectorSearchDocument,
  VectorSearchHit,
  VectorSearchQuery,
  VectorSearchStore,
} from '@agentmesh/common';

export class InMemoryVectorSearchStore implements VectorSearchStore {
  private readonly documents = new Map<string, VectorSearchDocument>();

  async initialize(): Promise<void> {}

  async upsert(document: VectorSearchDocument): Promise<void> {
    this.validateEmbedding(document.embedding);
    this.documents.set(this.key(document.tenantId, document.id), {
      ...document,
      embedding: [...document.embedding],
      metadata: { ...document.metadata },
    });
  }

  async upsertBatch(documents: VectorSearchDocument[]): Promise<void> {
    await Promise.all(documents.map((document) => this.upsert(document)));
  }

  async replaceTenant(tenantId: string, documents: VectorSearchDocument[]): Promise<void> {
    const replacement = new Map<string, VectorSearchDocument>();
    for (const document of documents) {
      if (document.tenantId !== tenantId) {
        throw new Error('Tenant replacement cannot contain documents from another tenant');
      }
      this.validateEmbedding(document.embedding);
      replacement.set(this.key(document.tenantId, document.id), {
        ...document,
        embedding: [...document.embedding],
        metadata: { ...document.metadata },
      });
    }
    await this.deleteByTenant(tenantId);
    for (const [key, document] of replacement) this.documents.set(key, document);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    this.documents.delete(this.key(tenantId, id));
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    for (const [key, document] of this.documents) {
      if (document.tenantId === tenantId) this.documents.delete(key);
    }
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchHit[]> {
    this.validateEmbedding(query.embedding);
    const limit = Math.max(1, query.limit ?? 10);
    const minScore = query.minScore ?? -1;
    const allowedHashes = new Set(query.allowedPermissionHashes ?? []);
    const includePublic = query.includePublic ?? true;

    return Array.from(this.documents.values())
      .filter((document) => document.tenantId === query.tenantId)
      .filter(
        (document) =>
          !query.resourceTypes?.length || query.resourceTypes.includes(document.resourceType),
      )
      .filter(
        (document) =>
          query.bypassPermissions ||
          (document.permissionHash === null
            ? includePublic
            : allowedHashes.has(document.permissionHash)),
      )
      .map((document) => ({
        document,
        score: this.cosineSimilarity(query.embedding, document.embedding),
      }))
      .filter((hit) => hit.score >= minScore)
      .sort(
        (left, right) =>
          right.score - left.score || left.document.id.localeCompare(right.document.id),
      )
      .slice(0, limit);
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  async count(tenantId?: string): Promise<number> {
    if (!tenantId) return this.documents.size;
    return Array.from(this.documents.values()).filter((document) => document.tenantId === tenantId)
      .length;
  }

  async close(): Promise<void> {}

  private cosineSimilarity(left: number[], right: number[]): number {
    if (left.length !== right.length) {
      throw new Error(`Embedding dimension mismatch: ${left.length} !== ${right.length}`);
    }

    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftValue = left[index] ?? 0;
      const rightValue = right[index] ?? 0;
      dotProduct += leftValue * rightValue;
      leftMagnitude += leftValue * leftValue;
      rightMagnitude += rightValue * rightValue;
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
    return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
  }

  private validateEmbedding(embedding: number[]): void {
    if (embedding.length === 0 || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Embedding must contain finite numeric values');
    }
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
