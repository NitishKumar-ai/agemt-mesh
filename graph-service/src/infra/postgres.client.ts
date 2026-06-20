import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

export interface CorrectionRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  correction_type: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  new_value: string; // JSON String
  old_value: string | null; // JSON String
  status: string; // 'queued' | 'applied' | 'rejected'
  requires_review: number; // 0 or 1
  created_at: string;
  applied_at: string | null;
  rejected_at: string | null;
}

interface DB {
  corrections: CorrectionRecord;
}

export class PostgresClient {
  private db: Kysely<DB> | null = null;

  private inMemoryCorrections: CorrectionRecord[] = [];

  constructor() {
    // If a database path is configured or we just default to an in-memory/file SQLite
    const dbPath = process.env.CORRECTIONS_DB_PATH || ':memory:';
    try {
      const sqliteDb = new DatabaseDriver(dbPath);
      this.db = new Kysely<DB>({
        dialect: new SqliteDialect({
          database: sqliteDb,
        }),
      });
      this.initTable();
    } catch {
      console.warn('PostgresClient local SQLite initialization failed, using in-memory array fallback.');
    }
  }

  private async initTable() {
    if (!this.db) return;
    try {
      await this.db.schema
        .createTable('corrections')
        .ifNotExists()
        .addColumn('id', 'text', (cb) => cb.primaryKey())
        .addColumn('tenant_id', 'text', (cb) => cb.notNull())
        .addColumn('user_id', 'text', (cb) => cb.notNull())
        .addColumn('correction_type', 'text', (cb) => cb.notNull())
        .addColumn('target_type', 'text', (cb) => cb.notNull())
        .addColumn('target_id', 'text', (cb) => cb.notNull())
        .addColumn('reason', 'text')
        .addColumn('new_value', 'text')
        .addColumn('old_value', 'text')
        .addColumn('status', 'text', (cb) => cb.notNull())
        .addColumn('requires_review', 'integer', (cb) => cb.defaultTo(0))
        .addColumn('created_at', 'text', (cb) => cb.notNull())
        .addColumn('applied_at', 'text')
        .addColumn('rejected_at', 'text')
        .execute();
    } catch {
      console.warn('Failed to run migration for corrections table:');
    }
  }

  async insertCorrection(record: CorrectionRecord): Promise<void> {
    this.inMemoryCorrections.push({ ...record });
    if (!this.db) return;
    try {
      await this.db.insertInto('corrections').values(record).execute();
    } catch {
      // ignore write error
    }
  }

  async getCorrection(id: string): Promise<CorrectionRecord | null> {
    if (!this.db) {
      return this.inMemoryCorrections.find((c) => c.id === id) || null;
    }
    try {
      const res = await this.db
        .selectFrom('corrections')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return res || null;
    } catch {
      return this.inMemoryCorrections.find((c) => c.id === id) || null;
    }
  }

  async updateCorrectionStatus(
    id: string,
    status: string,
    appliedAt?: string,
    rejectedAt?: string
  ): Promise<void> {
    const localRec = this.inMemoryCorrections.find((c) => c.id === id);
    if (localRec) {
      localRec.status = status;
      localRec.applied_at = appliedAt || null;
      localRec.rejected_at = rejectedAt || null;
    }
    if (!this.db) return;
    try {
      await this.db
        .updateTable('corrections')
        .set({
          status,
          applied_at: appliedAt || null,
          rejected_at: rejectedAt || null,
        })
        .where('id', '=', id)
        .execute();
    } catch {
      // ignore update error
    }
  }

  async listCorrections(tenantId: string): Promise<CorrectionRecord[]> {
    if (!this.db) {
      return this.inMemoryCorrections.filter((c) => c.tenant_id === tenantId);
    }
    try {
      return await this.db
        .selectFrom('corrections')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    } catch {
      return this.inMemoryCorrections.filter((c) => c.tenant_id === tenantId);
    }
  }

  async close() {
    if (this.db) {
      await this.db.destroy();
    }
  }
}

export const postgresClient = new PostgresClient();
