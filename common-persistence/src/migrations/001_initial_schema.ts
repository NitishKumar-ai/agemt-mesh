import { Kysely, sql, type ColumnDefinitionBuilder, type CreateTableBuilder } from 'kysely';

function isPostgres(db: Kysely<any>): boolean {
  try {
    const compiled = db.selectFrom('meta_event_handler').where('id', '=', 1).compile();
    return compiled.sql.includes('$1');
  } catch {
    return false;
  }
}

function createTableWithAutoIncrementId(
  db: Kysely<any>,
  tableName: string,
): CreateTableBuilder<any, any> {
  const builder = db.schema.createTable(tableName);
  if (isPostgres(db)) {
    return builder.addColumn('id', 'serial', (col) => col.primaryKey());
  } else {
    return builder.addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement());
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await createTableWithAutoIncrementId(db as any, 'meta_event_handler')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('event', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('active', 'boolean', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema
    .createIndex('event_handler_name_index')
    .on('meta_event_handler')
    .column('name')
    .execute();
  await db.schema
    .createIndex('event_handler_event_index')
    .on('meta_event_handler')
    .column('event')
    .execute();

  await createTableWithAutoIncrementId(db as any, 'meta_task_def')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull().unique())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await createTableWithAutoIncrementId(db as any, 'meta_workflow_def')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('version', 'integer', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('latest_version', 'integer', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_name_version', ['name', 'version'])
    .execute();

  await db.schema
    .createIndex('workflow_def_name_index')
    .on('meta_workflow_def')
    .column('name')
    .execute();

  await createTableWithAutoIncrementId(db as any, 'event_execution')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('event_handler_name', 'varchar(255)', (col: ColumnDefinitionBuilder) =>
      col.notNull(),
    )
    .addColumn('event_name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('message_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('execution_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_event_execution', [
      'event_handler_name',
      'event_name',
      'message_id',
    ])
    .execute();

  await createTableWithAutoIncrementId(db as any, 'poll_data')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('queue_name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('domain', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_poll_data', ['queue_name', 'domain'])
    .execute();

  await db.schema
    .createIndex('poll_data_queue_name_index')
    .on('poll_data')
    .column('queue_name')
    .execute();

  await createTableWithAutoIncrementId(db as any, 'task_scheduled')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('task_key', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('task_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_workflow_id_task_key', ['workflow_id', 'task_key'])
    .execute();

  await createTableWithAutoIncrementId(db as any, 'task_in_progress')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('task_def_name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('task_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('in_progress_status', 'boolean', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(false),
    )
    .addUniqueConstraint('unique_task_def_task_id1', ['task_def_name', 'task_id'])
    .execute();

  await createTableWithAutoIncrementId(db as any, 'task')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('task_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull().unique())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await createTableWithAutoIncrementId(db as any, 'task_log')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('task_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await db.schema.createIndex('idx_task_log_task_id').on('task_log').column('task_id').execute();

  await createTableWithAutoIncrementId(db as any, 'workflow')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) =>
      col.notNull().unique(),
    )
    .addColumn('correlation_id', 'varchar(255)')
    .addColumn('json_data', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();

  await createTableWithAutoIncrementId(db as any, 'workflow_def_to_workflow')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('workflow_def', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('date_str', 'varchar(60)')
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_workflow_def_date_str', [
      'workflow_def',
      'date_str',
      'workflow_id',
    ])
    .execute();

  await createTableWithAutoIncrementId(db as any, 'workflow_pending')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('workflow_type', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_workflow_type_workflow_id', ['workflow_type', 'workflow_id'])
    .execute();
  await db.schema
    .createIndex('workflow_type_index')
    .on('workflow_pending')
    .column('workflow_type')
    .execute();

  await createTableWithAutoIncrementId(db as any, 'workflow_to_task')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('modified_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('workflow_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('task_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addUniqueConstraint('unique_workflow_to_task_id', ['workflow_id', 'task_id'])
    .execute();
  await db.schema
    .createIndex('workflow_id_index')
    .on('workflow_to_task')
    .column('workflow_id')
    .execute();

  await createTableWithAutoIncrementId(db as any, 'queue')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('queue_name', 'varchar(255)', (col: ColumnDefinitionBuilder) =>
      col.notNull().unique(),
    )
    .execute();

  await createTableWithAutoIncrementId(db as any, 'queue_message')
    .addColumn('created_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('deliver_on', 'timestamp', (col: ColumnDefinitionBuilder) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('queue_name', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('message_id', 'varchar(255)', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('priority', 'integer', (col: ColumnDefinitionBuilder) => col.defaultTo(0))
    .addColumn('popped', 'boolean', (col: ColumnDefinitionBuilder) => col.defaultTo(false))
    .addColumn('offset_time_seconds', 'bigint')
    .addColumn('payload', 'text')
    .addUniqueConstraint('unique_queue_name_message_id', ['queue_name', 'message_id'])
    .execute();

  await db.schema
    .createIndex('combo_queue_message')
    .on('queue_message')
    .columns(['queue_name', 'popped', 'deliver_on', 'created_on'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'queue_message',
    'queue',
    'workflow_to_task',
    'workflow_pending',
    'workflow_def_to_workflow',
    'workflow',
    'task',
    'task_in_progress',
    'task_scheduled',
    'task_log',
    'poll_data',
    'event_execution',
    'meta_workflow_def',
    'meta_task_def',
    'meta_event_handler',
  ];
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
