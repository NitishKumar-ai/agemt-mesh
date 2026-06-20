import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import DatabaseConstructor from 'better-sqlite3';

export interface Database {
  tenants: TenantTable;
  episodes: EpisodeTable;
  entities: EntityTable;
  facts: FactTable;
  relations: RelationTable;
  ingestion_jobs: IngestionJobTable;
  search_index: SearchIndexTable;
}

export interface TenantTable {
  tenant_id: string;
  name: string;
  region: string | null;
  policy_profile: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface EpisodeTable {
  episode_id: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  raw_pointer: string;
  parsed_hash: string | null;
  parsed_content: Record<string, unknown> | null;
  author: string | null;
  created_at: Date;
  ingested_at: Date;
}

export interface EntityTable {
  entity_id: string;
  tenant_id: string;
  name: string;
  entity_type: string;
  aliases: string[];
  source_refs: unknown[];
  created_at: Date;
}

export interface FactTable {
  fact_id: string;
  tenant_id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean;
  confidence: number;
  status: 'active' | 'superseded' | 'disputed' | 'deleted';
  observed_at: Date;
  ingested_at: Date;
  valid_from: Date;
  valid_to: Date | null;
  superseded_by: string | null;
  episode_ids: string[];
  extractor_version: string;
}

export interface IngestionJobTable {
  job_id: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  event_time: Date;
  arrival_time: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  error_message: string | null;
  processed_at: Date | null;
}

export interface SearchIndexTable {
  id: string;
  tenant_id: string;
  fact_id: string | null;
  episode_id: string | null;
  embedding: unknown;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface RelationTable {
  relation_id: string;
  tenant_id: string;
  relation_type: string;
  source_entity_id: string;
  target_entity_id: string;
  confidence: number;
  status: 'active' | 'superseded';
  observed_at: Date;
  ingested_at: Date;
  episode_ids: string[];
  extractor_version: string;
}

export function createPostgresDatabase(
  connectionString: string
): Kysely<Database> {
  const pool = new Pool({ connectionString });

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}

export function createSQLiteDatabase(
  path: string
): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: new DatabaseConstructor(path),
    }),
  });
}