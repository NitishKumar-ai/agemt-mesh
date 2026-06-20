import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult } from '@company-knowledge-os/connector-social-common';
import { FacebookProvider } from './facebook-provider';

const BASE_URL = 'https://graph.facebook.com/v21.0';

/**
 * Facebook connector using direct OAuth credentials.
 *
 * Credentials come from environment variables:
 *   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 *
 * The access token is stored in config.extra.accessToken after OAuth exchange.
 * The page ID is stored in config.extra.pageId.
 *
 * OAuth callback URL (register in Facebook Developer Portal):
 *   http://localhost:8080/api/social-studio/oauth/facebook/callback
 */
export class FacebookConnector implements Connector {
  name = 'facebook';
  supportsWebhook = true;
  private provider: FacebookProvider;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new FacebookProvider({
      clientId: process.env.FACEBOOK_APP_ID ?? config.extra?.clientId ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? config.extra?.clientSecret ?? '',
    });
  }

  private getAccessToken(): string {
    const token = this.config.extra?.accessToken;
    if (!token) {
      throw new Error(
        'Facebook access token not set. ' +
        'Complete the OAuth flow first: GET /api/social-studio/oauth/facebook'
      );
    }
    return token;
  }

  /** Build the OAuth authorization URL to redirect the user to Facebook. */
  getAuthUrl(redirectUri: string, state: string): string {
    return this.provider.getAuthUrl(redirectUri, state);
  }

  /** Exchange the OAuth code for an access token and store it in config. */
  async handleCallback(code: string, redirectUri: string): Promise<string> {
    const tokens = await this.provider.exchangeCode(code, redirectUri);
    this.config.extra = { ...this.config.extra, accessToken: tokens.accessToken };
    return tokens.accessToken;
  }

  async bootstrap(): Promise<void> {
    const token = this.getAccessToken();
    const pageId = this.config.extra?.pageId;
    await this.provider.getProfile(token, pageId);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const token = this.getAccessToken();
    const pageId = this.config.extra?.pageId;
    if (!pageId) return [];

    const { data } = await axios.get(`${BASE_URL}/${pageId}/posts`, {
      params: {
        access_token: token,
        fields: 'id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)',
        since: Math.floor(since.getTime() / 1000),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const token = this.getAccessToken();
    const { data } = await axios.get(`${BASE_URL}/${sourceId}`, {
      params: { access_token: token, fields: 'id,message,created_time,permalink_url' },
    });
    return this.postToEpisode(data);
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('Facebook Page webhook subscription requires app review approval (not implemented)');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('Facebook webhooks not implemented');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    const token = this.getAccessToken();
    return this.provider.publish(token, content, this.config.extra?.pageId);
  }

  private postToEpisode(post: any): IEpisode {
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'facebook',
      source_id: post.id,
      source_version: post.created_time ?? String(Date.now()),
      raw_pointer: post.permalink_url ?? `facebook://post/${post.id}`,
      parsed_content: post,
      created_at: new Date(post.created_time ?? Date.now()),
      ingested_at: new Date(),
    };
  }
}
