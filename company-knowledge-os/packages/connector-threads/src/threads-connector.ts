import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { ThreadsProvider } from './threads-provider';

const API_BASE = 'https://graph.threads.net/v1.0';

export class ThreadsConnector implements Connector {
  name = 'threads';
  supportsWebhook = false;
  private provider: ThreadsProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private userId: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new ThreadsProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${API_BASE}/${this.userId}/threads`, {
      params: {
        access_token: this.accessToken,
        fields: 'id,text,permalink,timestamp',
        since: since.toISOString(),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${API_BASE}/${sourceId}`, {
      params: { access_token: this.accessToken, fields: 'id,text,permalink,timestamp' },
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
    return this.provider.publish(this.accessToken, content);
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
