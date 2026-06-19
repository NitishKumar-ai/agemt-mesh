import { Pool, types as pgTypes } from 'pg';
import type { ExternalPayloadStorage } from '@agentmesh/common-storage';

export interface PostgresExternalPayloadStorageOptions {
  /** PostgreSQL connection string or config object */
  connectionString?: string;
  /** Database connection pool (mutually exclusive with connectionString) */
  pool?: Pool;
  /** Table name for storing payloads (default: external_payload) */
  tableName?: string;
  /** Max rows before cleanup (default: 10000) */
  maxDataRows?: number;
  /** Max data age in days (default: 30) */
  maxDataDays?: number;
}

/**
 * PostgreSQL implementation of ExternalPayloadStorage.
 *
 * Stores JSON payloads as bytea rows in a configurable table, with an
 * automatic cleanup trigger that evicts old or excess rows.
 *
 * Expected schema (applied via Flyway migration):
 *   CREATE TABLE external_payload (
 *     id         TEXT PRIMARY KEY,
 *     data       BYTEA NOT NULL,
 *     created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 */
export class PostgresExternalPayloadStorage implements ExternalPayloadStorage {
  private readonly pool: Pool;
  private readonly tableName: string;

  constructor(options: PostgresExternalPayloadStorageOptions) {
    this.pool =
      options.pool ??
      new Pool({ connectionString: options.connectionString ?? 'postgres://localhost:5432/agentmesh' });
    this.tableName = options.tableName ?? 'external_payload';
  }

  async store(path: string, payload: string): Promise<string> {
    const buffer = Buffer.from(payload, 'utf-8');
    await this.pool.query(
      `INSERT INTO ${this.tableName} (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, created_on = CURRENT_TIMESTAMP`,
      [path, buffer],
    );
    return `postgres://${this.tableName}/${path}`;
  }

  async get(path: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT data FROM ${this.tableName} WHERE id = $1`,
      [path],
    );
    if (result.rows.length === 0) return null;
    const buffer: Buffer = result.rows[0].data;
    return buffer.toString('utf-8');
  }

  async remove(path: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [path],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getSignedUrl(_path: string, _expirationInSeconds: number): Promise<string> {
    throw new Error('Signed URLs are not supported by Postgres external payload storage');
  }

  async destroy(): Promise<void> {
    await this.pool.end();
  }
}
