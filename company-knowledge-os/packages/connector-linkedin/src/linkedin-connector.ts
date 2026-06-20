import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult } from '@company-knowledge-os/connector-social-common';
import { LinkedInProvider } from './linkedin-provider';

const API_BASE = 'https://api.linkedin.com';

/**
 * LinkedIn connector using direct OAuth credentials.
 *
 * Credentials come from environment variables:
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *
 * The access token is stored in config.extra.accessToken after OAuth exchange.
 *
 * OAuth callback URL (register in LinkedIn Developer Portal):
 *   http://localhost:8080/api/social-studio/oauth/linkedin/callback
 */
export class LinkedInConnector implements Connector {
  name = 'linkedin';
  supportsWebhook = false;
  private provider: LinkedInProvider;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID ?? config.extra?.clientId ?? '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? config.extra?.clientSecret ?? '',
    });
  }

  private getAccessToken(): string {
    const token = this.config.extra?.accessToken;
    if (!token) {
      throw new Error(
        'LinkedIn access token not set. ' +
        'Complete the OAuth flow first: GET /api/social-studio/oauth/linkedin'
      );
    }
    return token;
  }

  /** Build the OAuth authorization URL to redirect the user to LinkedIn. */
  getAuthUrl(redirectUri: string, state: string): string {
    return this.provider.getAuthUrl(redirectUri, state);
  }

  /** Exchange the OAuth code for an access token and store it in config. */
  async handleCallback(code: string, redirectUri: string): Promise<string> {
    const tokens = await this.provider.exchangeCode(code, redirectUri);
    this.config.extra = { ...this.config.extra, accessToken: tokens.accessToken };
    if (tokens.refreshToken) {
      this.config.extra.refreshToken = tokens.refreshToken;
    }
    return tokens.accessToken;
  }

  async bootstrap(): Promise<void> {
    const token = this.getAccessToken();
    const profile = await this.provider.getProfile(token);
    // Cache the author URN for publishing
    this.config.extra = {
      ...this.config.extra,
      authorUrn: `urn:li:person:${profile.platformId}`,
    };
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const token = this.getAccessToken();
    const authorUrn = this.config.extra?.authorUrn ?? (await this.getAuthorUrn(token));

    const { data } = await axios.get(`${API_BASE}/v2/ugcPosts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'authors', authors: `List(${authorUrn})`, count: 50 },
    });

    const elements: any[] = data.elements ?? [];
    return elements
      .filter((post) => new Date(post.created?.time ?? 0) >= since)
      .map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const token = this.getAccessToken();
    const { data } = await axios.get(`${API_BASE}/v2/ugcPosts/${encodeURIComponent(sourceId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return this.postToEpisode(data);
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('LinkedIn does not support webhook subscriptions');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('LinkedIn does not support webhooks');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    const token = this.getAccessToken();
    return this.provider.publish(token, content);
  }

  private async getAuthorUrn(token: string): Promise<string> {
    if (this.config.extra?.authorUrn) return this.config.extra.authorUrn;
    const profile = await this.provider.getProfile(token);
    const authorUrn = `urn:li:person:${profile.platformId}`;
    this.config.extra = { ...this.config.extra, authorUrn };
    return authorUrn;
  }

  private postToEpisode(post: any): IEpisode {
    const createdMs = post.created?.time ?? post.lastModified?.time ?? Date.now();
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'linkedin',
      source_id: post.id,
      source_version: String(post.lastModified?.time ?? createdMs),
      raw_pointer: `linkedin://post/${post.id}`,
      parsed_content: post,
      author: post.author,
      created_at: new Date(createdMs),
      ingested_at: new Date(),
    };
  }
}
