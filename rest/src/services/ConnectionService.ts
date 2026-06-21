import fs from 'node:fs';
import path from 'node:path';
import type { ConnectionDAO, StoredConnection } from '@agentmesh/common-persistence';

export const CONNECTION_SERVICE = 'CONNECTION_SERVICE';

export interface ApiConnectionInfo {
  id: string;
  provider_id: string;
  status: string;
  connector_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface ApiConnectorConfig {
  provider_id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  auth_type: 'oauth' | 'api_key';
  config_schema?: Array<Record<string, unknown>>;
}

export interface OAuthTokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

const SOCIAL_PLATFORMS = [
  'linkedin',
  'threads',
  'facebook',
  'instagram',
  'twitter',
  'tiktok',
  'youtube',
] as const;

const SCALEKIT_PROVIDERS = ['slack', 'airtable', 'gmail', 'notion', 'github'] as const;

const AVAILABLE_CONNECTORS: ApiConnectorConfig[] = [
  {
    provider_id: 'github',
    name: 'GitHub',
    description: 'Ingest commits, pull requests, and issues from your repositories.',
    category: 'development',
    icon: 'github',
    auth_type: 'oauth',
  },
  {
    provider_id: 'gmail',
    name: 'Gmail',
    description: 'Ingest email threads and extract facts from important messages.',
    category: 'communication',
    icon: 'mail',
    auth_type: 'oauth',
  },
  {
    provider_id: 'slack',
    name: 'Slack',
    description: 'Ingest and reply to Slack messages.',
    category: 'collaboration',
    icon: 'message-square',
    auth_type: 'oauth',
  },
  {
    provider_id: 'notion',
    name: 'Notion',
    description: 'Sync pages, docs, and databases from Notion.',
    category: 'knowledge',
    icon: 'book-open',
    auth_type: 'oauth',
  },
  {
    provider_id: 'airtable',
    name: 'Airtable',
    description: 'Read and write Airtable bases.',
    category: 'database',
    icon: 'database',
    auth_type: 'oauth',
  },
  {
    provider_id: 'drive',
    name: 'Google Drive',
    description: 'Ingest documents and files from Google Drive.',
    category: 'storage',
    icon: 'hard-drive',
    auth_type: 'oauth',
  },
  {
    provider_id: 'linkedin',
    name: 'LinkedIn',
    description: 'Publish posts and ingest your company page activity.',
    category: 'social',
    icon: 'linkedin',
    auth_type: 'oauth',
  },
  {
    provider_id: 'instagram',
    name: 'Instagram',
    description: 'Publish to and ingest posts from an Instagram Business account.',
    category: 'social',
    icon: 'instagram',
    auth_type: 'oauth',
  },
  {
    provider_id: 'facebook',
    name: 'Facebook',
    description: 'Publish to and ingest posts from a Facebook Page.',
    category: 'social',
    icon: 'facebook',
    auth_type: 'oauth',
  },
  {
    provider_id: 'threads',
    name: 'Threads',
    description: 'Publish and ingest Threads posts.',
    category: 'social',
    icon: 'message-square',
    auth_type: 'oauth',
  },
  {
    provider_id: 'scalekit',
    name: 'ScaleKit',
    description: 'Sync SSO and directory identity changes into the knowledge graph.',
    category: 'identity',
    icon: 'key-round',
    auth_type: 'oauth',
  },
  {
    provider_id: 'openai',
    name: 'OpenAI',
    description: 'Connect your OpenAI account for intelligent chat and agents.',
    category: 'ai',
    icon: 'bot',
    auth_type: 'api_key',
    config_schema: [
      { name: 'apiKey', type: 'string', label: 'API Key', secret: true }
    ],
  },
];

function socialConnectionId(platform: string): string {
  return `social:${platform}`;
}

function scalekitConnectionId(providerId: string): string {
  return `scalekit:${providerId}`;
}

function toApiConnection(row: StoredConnection): ApiConnectionInfo {
  const expired =
    row.status === 'expired' ||
    (typeof row.config.expiresAt === 'number' && Date.now() > row.config.expiresAt);
  return {
    id: row.id,
    provider_id: row.providerId,
    status: expired ? 'expired' : row.status,
    connector_type: row.connectorType,
    created_at: new Date(row.createdAt).toISOString(),
    metadata: row.metadata,
  };
}

export class ConnectionService {
  constructor(private readonly dao: ConnectionDAO) {}

  listAvailableConnectors(): ApiConnectorConfig[] {
    return AVAILABLE_CONNECTORS;
  }

  getScalekitConnectionName(providerId: string): string {
    const envKey = `SCALEKIT_CONNECTION_${providerId.toUpperCase()}`;
    const fromEnv = process.env[envKey];
    if (fromEnv) return fromEnv;

    const defaults: Record<string, string> = {
      slack: 'slack-SudvXvwi',
      airtable: 'airtable-QvhprOUU',
      gmail: 'gmail',
      notion: 'notion',
      github: 'github',
    };
    return defaults[providerId] ?? providerId;
  }

  providerFromScalekitConnector(connectorName: string): string {
    for (const provider of SCALEKIT_PROVIDERS) {
      if (this.getScalekitConnectionName(provider) === connectorName) {
        return provider;
      }
    }
    return connectorName;
  }

  defaultScalekitIdentifier(): string {
    return (
      process.env.SCALEKIT_DEFAULT_IDENTIFIER ||
      process.env.SCALEKIT_USER_IDENTIFIER ||
      'demo@agentmesh.dev'
    );
  }

  async listConnectionsApi(): Promise<{ connections: ApiConnectionInfo[] }> {
    return { connections: await this.listConnections() };
  }

  listAvailableConnectorsApi(): { connectors: ApiConnectorConfig[] } {
    return { connectors: this.listAvailableConnectors() };
  }

  async listConnections(): Promise<ApiConnectionInfo[]> {
    await this.syncScalekitAccounts();
    const rows = await this.dao.list();
    return rows
      .filter((row) => row.status !== 'disconnected')
      .map(toApiConnection);
  }

  /**
   * Seed a small set of realistic "active" connections so the Connections page
   * is populated out of the box in the demo. Idempotent: each row uses a stable
   * `demo:<provider>` id, so calling this on every boot upserts rather than
   * duplicates. Skips any provider that already has a live (non-demo) connection
   * — e.g. a real Scalekit or social OAuth account — so real data always wins.
   */
  async seedDemoConnections(): Promise<void> {
    const existing = await this.dao.list();
    const liveProviders = new Set(
      existing
        .filter((row) => !row.id.startsWith('demo:') && row.status !== 'disconnected')
        .map((row) => row.providerId),
    );

    const demos: Array<{
      providerId: string;
      connectorType: StoredConnection['connectorType'];
      status: StoredConnection['status'];
      name: string;
      account: string;
      daysAgo: number;
    }> = [
      { providerId: 'github', connectorType: 'scalekit', status: 'connected', name: 'GitHub', account: 'globex-engineering', daysAgo: 12 },
      { providerId: 'slack', connectorType: 'scalekit', status: 'connected', name: 'Slack', account: 'Globex HQ', daysAgo: 9 },
      { providerId: 'notion', connectorType: 'scalekit', status: 'connected', name: 'Notion', account: 'Globex Workspace', daysAgo: 6 },
      { providerId: 'gmail', connectorType: 'scalekit', status: 'expired', name: 'Gmail', account: 'demo@globex.example', daysAgo: 21 },
      { providerId: 'linkedin', connectorType: 'social', status: 'connected', name: 'LinkedIn', account: 'Globex Inc.', daysAgo: 4 },
    ];

    for (const demo of demos) {
      if (liveProviders.has(demo.providerId)) continue;
      const createdAt = Date.now() - demo.daysAgo * 24 * 60 * 60 * 1000;
      await this.dao.upsert({
        id: `demo:${demo.providerId}`,
        providerId: demo.providerId,
        connectorType: demo.connectorType,
        status: demo.status,
        config: { demo: true, connectedAt: createdAt },
        metadata: { name: demo.name, account: demo.account, demo: true },
      });
    }
  }

  async createManualConnection(input: {
    provider_id: string;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<ApiConnectionInfo> {
    const id = `manual:${input.provider_id}:${Date.now()}`;
    const saved = await this.dao.upsert({
      id,
      providerId: input.provider_id,
      connectorType: 'manual',
      status: 'connected',
      config: input.config ?? {},
      metadata: input.metadata ?? {},
    });
    return toApiConnection(saved);
  }

  async deleteConnection(id: string): Promise<boolean> {
    if (id.startsWith('social:')) {
      const platform = id.slice('social:'.length);
      const linked = await this.dao.getByProvider(platform);
      if (linked?.providerId === 'instagram' || linked?.providerId === 'facebook') {
        await this.dao.delete(socialConnectionId('instagram'));
        await this.dao.delete(socialConnectionId('facebook'));
      }
      return this.dao.delete(id);
    }
    return this.dao.delete(id);
  }

  async upsertSocialToken(platform: string, token: OAuthTokenPayload): Promise<StoredConnection> {
    const expiresAt = token.expiresAt;
    const status =
      typeof expiresAt === 'number' && Date.now() > expiresAt ? 'expired' : 'connected';
    return this.dao.upsert({
      id: socialConnectionId(platform),
      providerId: platform,
      connectorType: 'social',
      status,
      config: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        connectedAt: Date.now(),
      },
      metadata: token.metadata ?? {},
    });
  }

  async getSocialToken(platform: string): Promise<StoredConnection | null> {
    return this.dao.get(socialConnectionId(platform));
  }

  async getSocialStatus(): Promise<
    Record<
      string,
      {
        connected: boolean;
        expired?: boolean;
        connectedAt?: number | null;
        metadata?: Record<string, unknown>;
      }
    >
  > {
    const rows = await this.dao.list();
    const socialRows = rows.filter((row) => row.connectorType === 'social');
    return Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => {
        const row = socialRows.find((entry) => entry.providerId === platform);
        if (!row || row.status === 'disconnected') {
          return [platform, { connected: false }];
        }
        const expiresAt =
          typeof row.config.expiresAt === 'number' ? row.config.expiresAt : undefined;
        const expired =
          row.status === 'expired' ||
          (typeof expiresAt === 'number' && Date.now() > expiresAt);
        const connectedAt =
          typeof row.config.connectedAt === 'number' ? row.config.connectedAt : row.createdAt;
        return [
          platform,
          {
            connected: true,
            expired,
            connectedAt,
            metadata: row.metadata,
          },
        ];
      }),
    );
  }

  async removeSocialToken(platform: string): Promise<boolean> {
    const deleted = await this.dao.delete(socialConnectionId(platform));
    if (platform === 'facebook') {
      await this.dao.delete(socialConnectionId('instagram'));
    }
    return deleted;
  }

  async syncScalekitAccounts(): Promise<void> {
    const envUrl = process.env.SCALEKIT_ENVIRONMENT_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;
    const orgId = process.env.SCALEKIT_ORGANIZATION_ID;
    if (!envUrl || !clientId || !clientSecret || !orgId) return;

    try {
      const { ScalekitClient } = await import('@scalekit-sdk/node');
      const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);
      const accountsRes = await scalekit.actions.listConnectedAccounts({ organizationId: orgId });
      const activeAccounts = (accountsRes.connectedAccounts || []).filter((acc) => acc.status === 3);

      for (const account of activeAccounts) {
        const providerId = this.providerFromScalekitConnector(account.connector);
        await this.dao.upsert({
          id: scalekitConnectionId(providerId),
          providerId,
          connectorType: 'scalekit',
          status: 'connected',
          config: {
            scalekitAccountId: account.id,
            connectionName: account.connector,
            identifier: account.identifier,
          },
          metadata: {
            name: account.identifier || AVAILABLE_CONNECTORS.find((c) => c.provider_id === providerId)?.name || providerId,
          },
        });
      }
    } catch (err) {
      console.error('[ConnectionService] Failed to sync Scalekit accounts:', err);
    }
  }

  async migrateTokenFile(): Promise<void> {
    const tokensFile =
      process.env.SOCIAL_TOKENS_PATH || path.join(process.cwd(), '.social-tokens.json');
    if (!fs.existsSync(tokensFile)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(tokensFile, 'utf8')) as Record<
        string,
        OAuthTokenPayload & { connectedAt?: number }
      >;
      for (const [platform, entry] of Object.entries(raw)) {
        if (!entry?.accessToken) continue;
        await this.upsertSocialToken(platform, {
          accessToken: entry.accessToken,
          refreshToken: entry.refreshToken,
          expiresAt: entry.expiresAt,
          metadata: entry.metadata,
        });
      }
      const migratedPath = `${tokensFile}.migrated`;
      if (!fs.existsSync(migratedPath)) {
        fs.renameSync(tokensFile, migratedPath);
      }
      console.log(`[ConnectionService] Migrated social tokens from ${tokensFile} into SQLite`);
    } catch (err) {
      console.error('[ConnectionService] Token file migration failed:', err);
    }
  }
}
