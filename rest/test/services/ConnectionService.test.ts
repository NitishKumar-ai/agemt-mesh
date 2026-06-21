import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { describe, expect, it, beforeEach } from 'vitest';
import type { Database } from '@agentmesh/common-persistence';
import { DashboardMigration } from '@agentmesh/common-persistence';
import { SqliteConnectionDAO } from '@agentmesh/sqlite-persistence';
import { ConnectionService } from '../../src/services/ConnectionService.js';

async function createService(): Promise<ConnectionService> {
  const sqliteDb = new DatabaseDriver(':memory:');
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  });
  await DashboardMigration.up(db as never);
  return new ConnectionService(new SqliteConnectionDAO(db as never));
}

describe('ConnectionService', () => {
  let service: ConnectionService;

  beforeEach(async () => {
    service = await createService();
  });

  it('persists social OAuth tokens in SQLite', async () => {
    await service.upsertSocialToken('linkedin', {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60_000,
      metadata: { name: 'Test User' },
    });

    const connections = await service.listConnections();
    expect(connections).toHaveLength(1);
    const first = connections[0]!;
    expect(first.provider_id).toBe('linkedin');
    expect(first.connector_type).toBe('social');
    expect(first.metadata.name).toBe('Test User');
  });

  it('removes social tokens by connection id', async () => {
    await service.upsertSocialToken('linkedin', {
      accessToken: 'token-123',
    });
    const removed = await service.deleteConnection('social:linkedin');
    expect(removed).toBe(true);
    expect(await service.listConnections()).toHaveLength(0);
  });

  it('returns available connectors including gmail, slack, notion, github, and airtable', () => {
    const providers = service.listAvailableConnectors().map((c) => c.provider_id);
    expect(providers).toEqual(
      expect.arrayContaining(['gmail', 'slack', 'notion', 'github', 'airtable']),
    );
  });
});
