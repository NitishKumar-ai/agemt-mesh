import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult } from '@company-knowledge-os/connector-social-common';
import { ThreadsProvider } from './threads-provider';

const API_BASE = 'https://graph.threads.net/v1.0';

/**
 * Threads connector using direct access-token based auth.
 *
 * The access token is passed directly in the config (config.extra.accessToken).
 * The Threads app credentials (app ID / secret) come from environment variables:
 *   THREADS_APP_ID, THREADS_APP_SECRET
 *
 * OAuth flow:
 *   1. Call ThreadsProvider.getAuthUrl() to send the user to Threads authorization.
 *   2. On callback, call ThreadsProvider.exchangeCode() to get a long-lived token.
 *   3. Store the token in config.extra.accessToken.
 */
export class ThreadsConnector implements Connector {
  name = 'threads';
  supportsWebhook = false;
  private provider: ThreadsProvider;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new ThreadsProvider({
      clientId: process.env.THREADS_APP_ID ?? config.extra?.appId ?? '',
      clientSecret: process.env.THREADS_APP_SECRET ?? config.extra?.appSecret ?? '',
    });
  }

  private getAccessToken(): string {
    const token = this.config.extra?.accessToken;
    if (!token) {
      throw new Error(
        'Threads access token not set. ' +
        'Complete the OAuth flow first and store the token in config.extra.accessToken.'
      );
    }
    return token;
  }

  /** Build the OAuth authorization URL to redirect the user to. */
  getAuthUrl(redirectUri: string, state: string): string {
    return this.provider.getAuthUrl(redirectUri, state);
  }

  /** Exchange the OAuth code for a long-lived access token, and store it in config. */
  async handleCallback(code: string, redirectUri: string): Promise<string> {
    const tokens = await this.provider.exchangeCode(code, redirectUri);
    this.config.extra = { ...this.config.extra, accessToken: tokens.accessToken };
    return tokens.accessToken;
  }

  async bootstrap(): Promise<void> {
    const token = this.getAccessToken();
    await this.provider.getProfile(token);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const token = this.getAccessToken();
    const profile = await this.provider.getProfile(token);
    const userId = profile.platformId;

    const { data } = await axios.get(`${API_BASE}/${userId}/threads`, {
      params: {
        access_token: token,
        fields: 'id,text,permalink,timestamp',
        since: Math.floor(since.getTime() / 1000),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const token = this.getAccessToken();
    const { data } = await axios.get(`${API_BASE}/${sourceId}`, {
      params: { access_token: token, fields: 'id,text,permalink,timestamp' },
    });
    return this.postToEpisode(data);
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('Threads does not support webhook subscriptions');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('Threads does not support webhooks');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    const token = this.getAccessToken();
    const replyToId = this.config.extra?.replyToId;
    return this.provider.publish(token, content, replyToId);
  }

  private postToEpisode(post: any): IEpisode {
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'threads',
      source_id: post.id,
      source_version: post.timestamp ?? String(Date.now()),
      raw_pointer: post.permalink ?? `threads://post/${post.id}`,
      parsed_content: post,
      created_at: new Date(post.timestamp ?? Date.now()),
      ingested_at: new Date(),
    };
  }
}
