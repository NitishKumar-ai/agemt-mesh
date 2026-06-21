export interface StoredConnection {
  id: string;
  providerId: string;
  connectorType: 'social' | 'scalekit' | 'manual';
  status: 'connected' | 'expired' | 'disconnected';
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertConnectionInput {
  id: string;
  providerId: string;
  connectorType: StoredConnection['connectorType'];
  status?: StoredConnection['status'];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ConnectionDAO {
  list(): Promise<StoredConnection[]>;
  get(id: string): Promise<StoredConnection | null>;
  getByProvider(providerId: string): Promise<StoredConnection | null>;
  upsert(input: UpsertConnectionInput): Promise<StoredConnection>;
  delete(id: string): Promise<boolean>;
}
