import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { FacebookProvider } from './facebook-provider';

const BASE_URL = 'https://graph.facebook.com/v21.0';

export class FacebookConnector implements Connector {
  name = 'facebook';
  supportsWebhook = true;
  private provider: FacebookProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private pageId: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new FacebookProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken, this.pageId);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${BASE_URL}/${this.pageId}/posts`, {
      params: {
        access_token: this.accessToken,
        fields: 'id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)',
        since: Math.floor(since.getTime() / 1000),
      },
    });
    const posts: any[] = data.data ?? [];
    return posts.map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${BASE_URL}/${sourceId}`, {
      params: { access_token: this.accessToken, fields: 'id,message,created_time,permalink_url' },
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
    return this.provider.publish(this.accessToken, content, this.pageId);
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
