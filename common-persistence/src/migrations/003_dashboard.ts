/**
 * Migration 003 — Dashboard tables.
 *
 * Adds tables required by the operator dashboard UI:
 *   - agent_sessions / agent_steps: durable agent run history
 *   - dlq_events: dead-letter queue entries surfaced on the Workflows page
 *   - approvals / approval_history: human-in-the-loop approval gates
 *   - safety_verdicts / safety_escalations: CriticGate safety evaluations
 *   - marketing_campaigns / marketing_audit_events: marketing workspace
 *   - security_findings: CommitGuard findings surfaced to marketing
 *   - dashboard_schedules: natural-language scheduled tasks
 *   - connections: unified third-party connector instances
 */

import { Kysely, sql, type ColumnDefinitionBuilder } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agent_sessions')
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('started_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('last_step', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(''))
    .addColumn('status', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('step_count', 'integer', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable('agent_steps')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('step', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('status', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_agent_steps_run_id')
    .on('agent_steps')
    .column('run_id')
    .execute();

  await db.schema
    .createTable('dlq_events')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('error', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('approvals')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('payload', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('status', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('risk_level', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('low'),
    )
    .addColumn('requesting_agent', 'varchar(255)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(''),
    )
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('approval_history')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('approval_id', 'integer', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('action', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('actor', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('payload', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_approval_history_approval_id')
    .on('approval_history')
    .column('approval_id')
    .execute();

  await db.schema
    .createTable('safety_verdicts')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('frame_hash', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('verdict', 'varchar(32)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('confidence', 'real', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(0))
    .addColumn('reasoning', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(''))
    .addColumn('checks', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('risk_tier', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('low'),
    )
    .addColumn('recursion_depth', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('counterfactual_flag', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('critic_model', 'varchar(255)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(''),
    )
    .addColumn('eval_duration_ms', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_safety_verdicts_run_id')
    .on('safety_verdicts')
    .column('run_id')
    .execute();

  await db.schema
    .createTable('safety_escalations')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('agent_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('frame_hash', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('verdict_id', 'integer')
    .addColumn('escalation_type', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('resolved', 'integer', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(0))
    .addColumn('resolved_by', 'varchar(255)')
    .addColumn('resolution', 'text')
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('resolved_at', 'bigint')
    .execute();

  await db.schema
    .createIndex('idx_safety_escalations_resolved')
    .on('safety_escalations')
    .column('resolved')
    .execute();

  await db.schema
    .createTable('marketing_campaigns')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('source_finding_id', 'integer')
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('audience', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('finding_summary', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('value_proposition', 'text')
    .addColumn('channel', 'varchar(32)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('status', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('draft'),
    )
    .addColumn('subject', 'text')
    .addColumn('body', 'text')
    .addColumn('approval_note', 'text')
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('marketing_audit_events')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('entity_type', 'varchar(32)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('entity_id', 'integer', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('action', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('actor', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('payload', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('security_findings')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('source_agent', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('title', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('summary', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('evidence', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(''))
    .addColumn('severity', 'varchar(16)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('repository', 'varchar(255)')
    .addColumn('status', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('review_required'),
    )
    .addColumn('verified_by', 'varchar(255)')
    .addColumn('verified_at', 'bigint')
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('dashboard_schedules')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('prompt', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('interval', 'varchar(64)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('enabled', 'integer', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(1))
    .addColumn('next_run_at', 'bigint')
    .addColumn('last_run_at', 'bigint')
    .addColumn('last_status', 'varchar(32)')
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('connections')
    .addColumn('id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('provider_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('connector_type', 'varchar(32)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('status', 'varchar(32)', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('connected'),
    )
    .addColumn('config', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('metadata', 'text', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo('{}'))
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createTable('killswitch_meta')
    .addColumn('key', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('engaged_by', 'varchar(255)')
    .addColumn('updated_at', 'bigint', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`0`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'killswitch_meta',
    'connections',
    'dashboard_schedules',
    'security_findings',
    'marketing_audit_events',
    'marketing_campaigns',
    'safety_escalations',
    'safety_verdicts',
    'approval_history',
    'approvals',
    'dlq_events',
    'agent_steps',
    'agent_sessions',
  ];
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
