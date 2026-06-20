import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { LinkedInProvider } from './linkedin-provider';

const API_BASE = 'https://api.linkedin.com';

/**
 * Implements the AgentMesh Connector interface (ingestion: bootstrap/
 * fetchChanges/fetchObject/webhook) and additionally exposes `publish()`,
 * which is outside that interface — publishing isn't a fetch-changes
 * concern, it's invoked directly by a publish workflow against the
 * connected account's stored token.
 */
export class LinkedInConnector implements Connector {
  name = 'linkedin';
  supportsWebhook = false;
  private provider: LinkedInProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private authorUrn: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new LinkedInProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${API_BASE}/v2/ugcPosts`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: { q: 'authors', authors: `List(${this.authorUrn})`, count: 50 },
    });

    const elements: any[] = data.elements ?? [];
    return elements
      .filter((post) => new Date(post.created?.time ?? post.lastModified?.time ?? 0) >= since)
      .map((post) => this.postToEpisode(post));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${API_BASE}/v2/ugcPosts/${encodeURIComponent(sourceId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
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

  /** Publishing — not part of the Connector ingestion interface. */
  async publish(content: PublishContent): Promise<PublishResult> {
    return this.provider.publish(this.accessToken, content);
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
