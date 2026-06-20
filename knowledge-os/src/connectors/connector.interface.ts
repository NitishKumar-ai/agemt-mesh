
export interface SyncOptions {
  fullSync?: boolean;
  since?: Date;
}

export interface SourceConnector {
  get name(): string;
  
  /**
   * Synchronizes data from the source applying least-privilege principles
   */
  sync(tenantId: string, options: SyncOptions): Promise<void>;
}
