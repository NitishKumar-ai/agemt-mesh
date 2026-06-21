import { Kysely } from 'kysely';
import type {
  ConnectionDAO,
  Database,
  StoredConnection,
  UpsertConnectionInput,
} from '@agentmesh/common-persistence';

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToConnection(row: {
  id: string;
  provider_id: string;
  connector_type: string;
  status: string;
  config: string;
  metadata: string;
  created_at: number;
  updated_at: number;
}): StoredConnection {
  return {
    id: row.id,
    providerId: row.provider_id,
    connectorType: row.connector_type as StoredConnection['connectorType'],
    status: row.status as StoredConnection['status'],
    config: parseJsonObject(row.config),
    metadata: parseJsonObject(row.metadata),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SqliteConnectionDAO implements ConnectionDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async list(): Promise<StoredConnection[]> {
    const rows = await this.db
      .selectFrom('connections')
      .selectAll()
      .orderBy('updated_at', 'desc')
      .execute();
    return rows.map(rowToConnection);
  }

  async get(id: string): Promise<StoredConnection | null> {
    const row = await this.db
      .selectFrom('connections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? rowToConnection(row) : null;
  }

  async getByProvider(providerId: string): Promise<StoredConnection | null> {
    const row = await this.db
      .selectFrom('connections')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('updated_at', 'desc')
      .executeTakeFirst();
    return row ? rowToConnection(row) : null;
  }

  async upsert(input: UpsertConnectionInput): Promise<StoredConnection> {
    const now = Date.now();
    const existing = await this.get(input.id);
    const config = JSON.stringify({ ...(existing?.config ?? {}), ...(input.config ?? {}) });
    const metadata = JSON.stringify({ ...(existing?.metadata ?? {}), ...(input.metadata ?? {}) });
    const status = input.status ?? existing?.status ?? 'connected';

    if (existing) {
      await this.db
        .updateTable('connections')
        .set({
          provider_id: input.providerId,
          connector_type: input.connectorType,
          status,
          config,
          metadata,
          updated_at: now,
        })
        .where('id', '=', input.id)
        .execute();
    } else {
      await this.db
        .insertInto('connections')
        .values({
          id: input.id,
          provider_id: input.providerId,
          connector_type: input.connectorType,
          status,
          config,
          metadata,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    const saved = await this.get(input.id);
    if (!saved) {
      throw new Error(`Failed to persist connection ${input.id}`);
    }
    return saved;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('connections').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
