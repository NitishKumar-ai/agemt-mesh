import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { TikTokProvider } from './tiktok-provider';

const API_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokConnector implements Connector {
  name = 'tiktok';
  supportsWebhook = false;
  private provider: TikTokProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new TikTokProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.post(
      `${API_BASE}/video/list/`,
      { max_count: 20 },
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        params: { fields: 'id,title,create_time,share_url,like_count,comment_count,view_count' },
      }
    );
    const videos: any[] = data.data?.videos ?? [];
    return videos
      .filter((v) => new Date((v.create_time ?? 0) * 1000) >= since)
      .map((v) => this.videoToEpisode(v));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.post(
      `${API_BASE}/video/query/`,
      { filters: { video_ids: [sourceId] } },
      { headers: { Authorization: `Bearer ${this.accessToken}` }, params: { fields: 'id,title,create_time,share_url' } }
    );
    return this.videoToEpisode(data.data?.videos?.[0] ?? { id: sourceId });
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('TikTok does not support webhook subscriptions via this connector');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('TikTok webhooks not implemented');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    return this.provider.publish(this.accessToken, content);
  }

  private videoToEpisode(video: any): IEpisode {
    const createdMs = (video.create_time ?? 0) * 1000;
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'tiktok',
      source_id: video.id,
      source_version: String(createdMs),
      raw_pointer: video.share_url ?? `tiktok://video/${video.id}`,
      parsed_content: video,
      created_at: new Date(createdMs || Date.now()),
      ingested_at: new Date(),
    };
  }
}
