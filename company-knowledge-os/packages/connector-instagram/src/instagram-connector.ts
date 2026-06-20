import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { InstagramProvider } from './instagram-provider';

const BASE_URL = 'https://graph.facebook.com/v21.0';

export class InstagramConnector implements Connector {
  name = 'instagram';
  supportsWebhook = true;
  private provider: InstagramProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private igAccountId: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new InstagramProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${BASE_URL}/${this.igAccountId}/media`, {
      params: {
        access_token: this.accessToken,
        fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
        since: Math.floor(since.getTime() / 1000),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${BASE_URL}/${sourceId}`, {
      params: {
        access_token: this.accessToken,
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
    return this.provider.publish(this.accessToken, content);
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
