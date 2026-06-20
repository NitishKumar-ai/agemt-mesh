export type EmbeddingPurpose = 'document' | 'query';

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string, purpose?: EmbeddingPurpose): Promise<number[]>;
  embedBatch(texts: string[], purpose?: EmbeddingPurpose): Promise<number[][]>;
}

export interface VectorSearchDocument {
  id: string;
  tenantId: string;
  resourceId: string;
  resourceType: string;
  content: string;
  embedding: number[];
  permissionHash: string | null;
  metadata: Record<string, unknown>;
}

export interface VectorSearchQuery {
  tenantId: string;
  embedding: number[];
  limit?: number;
  minScore?: number;
  resourceTypes?: string[];
  allowedPermissionHashes?: string[];
  includePublic?: boolean;
  /**
   * Trusted server-side tenant-admin bypass. API controllers must derive this
   * from authenticated policy state and must never accept it from callers.
   */
  bypassPermissions?: boolean;
}

export interface VectorSearchHit {
  document: VectorSearchDocument;
  score: number;
}

export interface VectorSearchStore {
  initialize(): Promise<void>;
  upsert(document: VectorSearchDocument): Promise<void>;
  upsertBatch(documents: VectorSearchDocument[]): Promise<void>;
  replaceTenant(tenantId: string, documents: VectorSearchDocument[]): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
  deleteByTenant(tenantId: string): Promise<void>;
  search(query: VectorSearchQuery): Promise<VectorSearchHit[]>;
  count(tenantId?: string): Promise<number>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
