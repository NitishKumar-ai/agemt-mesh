import { Kysely, sql } from 'kysely';

export const ConnectionsMigration = {
  async up(db: Kysely<any>): Promise<void> {
    await db.schema
      .createTable('connections')
      .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('provider_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('connector_type', 'varchar(255)', (col) => col.notNull())
      .addColumn('status', 'varchar(50)', (col) => col.notNull())
      .addColumn('config', 'text')
      .addColumn('metadata', 'text')
      .addColumn('created_at', 'bigint', (col) => col.notNull())
      .addColumn('updated_at', 'bigint', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('idx_connections_provider_id')
      .on('connections')
      .column('provider_id')
      .execute();
  },

  async down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('connections').execute();
  },
};
