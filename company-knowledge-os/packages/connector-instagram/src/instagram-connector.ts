import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult } from '@company-knowledge-os/connector-social-common';
import { InstagramProvider } from './instagram-provider';

const BASE_URL = 'https://graph.facebook.com/v21.0';

/**
 * Instagram connector using direct OAuth credentials (via Facebook Graph API).
 *
 * Credentials come from environment variables:
 *   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET  (Instagram uses the same Facebook app)
 *
 * The access token is stored in config.extra.accessToken after OAuth exchange.
 * The Instagram Business account ID is cached in config.extra.igAccountId.
 *
 * OAuth callback URL (register in Facebook Developer Portal):
 *   http://localhost:8080/api/social-studio/oauth/instagram/callback
 */
export class InstagramConnector implements Connector {
  name = 'instagram';
  supportsWebhook = true;
  private provider: InstagramProvider;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new InstagramProvider({
      clientId: process.env.FACEBOOK_APP_ID ?? config.extra?.clientId ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? config.extra?.clientSecret ?? '',
    });
  }

  private getAccessToken(): string {
    const token = this.config.extra?.accessToken;
    if (!token) {
      throw new Error(
        'Instagram access token not set. ' +
        'Complete the OAuth flow first: GET /api/social-studio/oauth/instagram'
      );
    }
    return token;
  }

  /** Build the OAuth authorization URL to redirect the user to Facebook/Instagram. */
  getAuthUrl(redirectUri: string, state: string): string {
    return this.provider.getAuthUrl(redirectUri, state);
  }

  /** Exchange the OAuth code for an access token and store it in config. */
  async handleCallback(code: string, redirectUri: string): Promise<string> {
    const tokens = await this.provider.exchangeCode(code, redirectUri);
    this.config.extra = { ...this.config.extra, accessToken: tokens.accessToken };
    return tokens.accessToken;
  }

  private async getIgAccountId(token: string): Promise<string> {
    if (this.config.extra?.igAccountId) return this.config.extra.igAccountId;
    const profile = await this.provider.getProfile(token);
    this.config.extra = { ...this.config.extra, igAccountId: profile.platformId };
    return profile.platformId;
  }

  async bootstrap(): Promise<void> {
    const token = this.getAccessToken();
    await this.getIgAccountId(token);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const token = this.getAccessToken();
    const accountId = await this.getIgAccountId(token);

    const { data } = await axios.get(`${BASE_URL}/${accountId}/media`, {
      params: {
        access_token: token,
        fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
        since: Math.floor(since.getTime() / 1000),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const token = this.getAccessToken();
    const { data } = await axios.get(`${BASE_URL}/${sourceId}`, {
      params: {
        access_token: token,
        fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
      },
    });
    return this.postToEpisode(data);
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('Instagram webhook subscription requires app review approval (not implemented)');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('Instagram webhooks not implemented');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    const token = this.getAccessToken();
    return this.provider.publish(token, content);
  }

  private postToEpisode(post: any): IEpisode {
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'instagram',
      source_id: post.id,
      source_version: post.timestamp ?? String(Date.now()),
      raw_pointer: post.permalink ?? `instagram://media/${post.id}`,
      parsed_content: post,
      created_at: new Date(post.timestamp ?? Date.now()),
      ingested_at: new Date(),
    };
  }
}
