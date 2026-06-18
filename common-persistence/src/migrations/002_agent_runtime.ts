/**
 * Migration 002 — Agent Runtime tables.
 *
 * Adds tables required by the 24/7 agent runtime (Phase 6):
 *   - system_config: key-value store for killswitch + feature flags
 *   - agent_schedules: cron-based agent scheduling
 *   - agent_run_tokens: per-phase LLM token/cost tracking
 */

import { Kysely, sql, type ColumnDefinitionBuilder } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Global system configuration (killswitch, feature flags)
  await db.schema
    .createTable('system_config')
    .addColumn('key', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('value', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`0`),
    )
    .execute();

  // Agent cron schedules
  await db.schema
    .createTable('agent_schedules')
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('cron_expression', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('timezone', 'varchar(64)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('UTC'),
    )
    .addColumn('paused', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('paused_reason', 'text')
    .addColumn('next_run_time', 'bigint')
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_agent_schedules_agent_id')
    .on('agent_schedules')
    .column('agent_id')
    .execute();

  // Agent run token/cost tracking (per phase)
  await db.schema
    .createTable('agent_run_tokens')
    .addColumn('id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('phase', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('model', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('prompt_tokens', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('completion_tokens', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cost_usd', 'real', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0.0),
    )
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_agent_run_tokens_run')
    .on('agent_run_tokens')
    .column('run_id')
    .execute();

  await db.schema
    .createIndex('idx_agent_run_tokens_agent')
    .on('agent_run_tokens')
    .column('agent_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = ['agent_run_tokens', 'agent_schedules', 'system_config'];
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
