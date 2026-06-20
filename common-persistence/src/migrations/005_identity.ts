import { Kysely, type ColumnDefinitionBuilder } from 'kysely';

/**
 * Durable identity & authorization schema (Pass 1 / T4).
 *
 * Adds the records authorization depends on beyond the flat
 * `user_access_grants` table from migration 004:
 *  - principals: humans and connector/service identities (kept distinct via
 *    `principal_type`).
 *  - tenant_memberships: which principals belong to which tenant, and whether
 *    membership is currently active.
 *  - principal_roles: durable role assignments (e.g. `admin`, `member`).
 *  - groups / group_memberships: directory-style groups synced from the IdP.
 *  - group_access_grants: permission hashes granted to a whole group, so a
 *    principal inherits visibility via group membership.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const notNull = (col: ColumnDefinitionBuilder) => col.notNull();

  await db.schema
    .createTable('principals')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('tenant_id', 'text', notNull)
    // 'user' for humans, 'service' for connector/service identities.
    .addColumn('principal_type', 'text', notNull)
    // OIDC subject (sub) for users; client_id or similar for services.
    .addColumn('external_subject', 'text')
    .addColumn('email', 'text')
    .addColumn('display_name', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createIndex('idx_principals_tenant_subject')
    .on('principals')
    .columns(['tenant_id', 'external_subject'])
    .execute();

  await db.schema
    .createTable('tenant_memberships')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('tenant_id', 'text', notNull)
    .addColumn('principal_id', 'text', notNull)
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createIndex('idx_tenant_memberships_unique')
    .on('tenant_memberships')
    .columns(['tenant_id', 'principal_id'])
    .unique()
    .execute();

  await db.schema
    .createTable('principal_roles')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('tenant_id', 'text', notNull)
    .addColumn('principal_id', 'text', notNull)
    .addColumn('role', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createIndex('idx_principal_roles_unique')
    .on('principal_roles')
    .columns(['tenant_id', 'principal_id', 'role'])
    .unique()
    .execute();

  await db.schema
    .createTable('groups')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('tenant_id', 'text', notNull)
    .addColumn('name', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createTable('group_memberships')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('tenant_id', 'text', notNull)
    .addColumn('group_id', 'text', notNull)
    .addColumn('principal_id', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createIndex('idx_group_memberships_unique')
    .on('group_memberships')
    .columns(['tenant_id', 'group_id', 'principal_id'])
    .unique()
    .execute();

  await db.schema
    .createTable('group_access_grants')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('tenant_id', 'text', notNull)
    .addColumn('group_id', 'text', notNull)
    .addColumn('permission_hash', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createIndex('idx_group_access_grants_unique')
    .on('group_access_grants')
    .columns(['tenant_id', 'group_id', 'permission_hash'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('group_access_grants').ifExists().execute();
  await db.schema.dropTable('group_memberships').ifExists().execute();
  await db.schema.dropTable('groups').ifExists().execute();
  await db.schema.dropTable('principal_roles').ifExists().execute();
  await db.schema.dropTable('tenant_memberships').ifExists().execute();
  await db.schema.dropTable('principals').ifExists().execute();
}
