import { Kysely, type ColumnDefinitionBuilder } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_access_grants')
    .addColumn('id', 'integer', (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement())
    .addColumn('tenant_id', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('user_id', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('permission_hash', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('is_admin', 'integer', (col: ColumnDefinitionBuilder) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'bigint', (col: ColumnDefinitionBuilder) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_access_grants').ifExists().execute();
}
