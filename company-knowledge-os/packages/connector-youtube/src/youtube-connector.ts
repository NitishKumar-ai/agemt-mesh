import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { YouTubeProvider } from './youtube-provider';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeConnector implements Connector {
  name = 'youtube';
  supportsWebhook = false;
  private provider: YouTubeProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private channelId: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new YouTubeProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${API_BASE}/search`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: {
        part: 'snippet',
        channelId: this.channelId,
        order: 'date',
        type: 'video',
        publishedAfter: since.toISOString(),
        maxResults: 50,
      },
    });
    const items: any[] = data.items ?? [];
    return items.map((item) => this.videoToEpisode(item));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${API_BASE}/videos`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: { part: 'snippet,statistics', id: sourceId },
    });
    return this.videoToEpisode(data.items?.[0] ?? { id: sourceId });
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('YouTube webhooks are handled via PubSubHubbub, not implemented here');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('YouTube webhooks not implemented');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    return this.provider.publish(this.accessToken, content);
  }

  private videoToEpisode(item: any): IEpisode {
    const videoId = typeof item.id === 'string' ? item.id : item.id?.videoId ?? item.id;
    const publishedAt = item.snippet?.publishedAt ?? new Date().toISOString();
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'youtube',
      source_id: videoId,
      source_version: publishedAt,
      raw_pointer: `https://www.youtube.com/watch?v=${videoId}`,
      parsed_content: item,
      created_at: new Date(publishedAt),
      ingested_at: new Date(),
    };
  }
}
