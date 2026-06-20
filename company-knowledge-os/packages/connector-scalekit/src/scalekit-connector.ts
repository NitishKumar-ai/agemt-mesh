import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';

export interface ScaleKitCredentials {
  clientId: string;
  clientSecret: string;
  /** ScaleKit environment URL, e.g. https://your-env.scalekit.com */
  envUrl: string;
  organizationId: string;
}

/**
 * Ingestion-only connector for ScaleKit (SSO/directory-sync provider).
 * Unlike the social connectors, ScaleKit isn't a content source — there's
 * nothing to `publish()`. It surfaces identity and org-membership changes
 * (directory user create/update/deactivate, SSO connection changes) as
 * Episodes, since "who exists in the org and what access they have" is
 * itself company-brain-relevant knowledge.
 */
export class ScaleKitConnector implements Connector {
  name = 'scalekit';
  supportsWebhook = true;
  webhookEndpoint = '/webhooks/scalekit';

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private credentials: ScaleKitCredentials,
    public config: ConnectorConfig = { enabled: true }
  ) {}

  async bootstrap(): Promise<void> {
    await this.ensureToken();
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const token = await this.ensureToken();
    const { data } = await axios.get(
      `${this.credentials.envUrl}/api/v1/organizations/${this.credentials.organizationId}/directories/users`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { updated_after: since.toISOString(), page_size: 200 },
      }
    );

    const users: any[] = data.users ?? data.data ?? [];
    return users.map((user) => this.userToEpisode(user));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const token = await this.ensureToken();
    const { data } = await axios.get(
      `${this.credentials.envUrl}/api/v1/organizations/${this.credentials.organizationId}/directories/users/${sourceId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return this.userToEpisode(data);
  }

  async subscribeWebhook(): Promise<void> {
    if (!this.config.webhook_secret) {
      throw new Error('webhook_secret not configured for ScaleKit connector');
    }
    const token = await this.ensureToken();
    await axios.post(
      `${this.credentials.envUrl}/api/v1/webhooks`,
      { url: this.webhookEndpoint, events: ['directory.user.created', 'directory.user.updated', 'directory.user.deleted'] },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  /** ScaleKit signs webhook payloads HMAC-SHA256, similar to Svix. */
  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhook_secret) return false;
    const expected = createHmac('sha256', this.config.webhook_secret).update(payload).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  async processWebhook(payload: { event_type: string; data: any }): Promise<void> {
    // Webhook delivery is fire-and-forget at the transport layer; turning
    // payload.data into an Episode reuses the same mapping fetchChanges
    // uses, so the ingestion pipeline (not this connector) is responsible
    // for persisting the result returned by mapping it through userToEpisode.
    if (!payload?.event_type?.startsWith('directory.user.')) return;
    this.userToEpisode(payload.data);
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const { data } = await axios.post(
      `${this.credentials.envUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000;
    return this.accessToken!;
  }

  private userToEpisode(user: any): IEpisode {
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'scalekit',
      source_id: user.id,
      source_version: user.updated_at ?? String(Date.now()),
      raw_pointer: `scalekit://organization/${this.credentials.organizationId}/user/${user.id}`,
      parsed_content: user,
      author: user.email,
      created_at: new Date(user.created_at ?? Date.now()),
      ingested_at: new Date(),
    };
  }
}
