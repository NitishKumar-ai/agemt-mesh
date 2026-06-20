import axios from 'axios';
import { Connector, ConnectorConfig, IEpisode } from '@company-knowledge-os/core';
import { PublishContent, PublishResult, SocialCredentials } from '@company-knowledge-os/connector-social-common';
import { TwitterProvider } from './twitter-provider';

const API_BASE = 'https://api.twitter.com/2';

export class TwitterConnector implements Connector {
  name = 'twitter';
  supportsWebhook = false;
  private provider: TwitterProvider;

  constructor(
    credentials: SocialCredentials,
    private accessToken: string,
    private userId: string,
    public config: ConnectorConfig = { enabled: true }
  ) {
    this.provider = new TwitterProvider(credentials);
  }

  async bootstrap(): Promise<void> {
    await this.provider.getProfile(this.accessToken);
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const { data } = await axios.get(`${API_BASE}/users/${this.userId}/tweets`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: {
        start_time: since.toISOString(),
        'tweet.fields': 'created_at,public_metrics,author_id',
        max_results: 100,
      },
    });

    const tweets: any[] = data.data ?? [];
    return tweets.map((tweet) => this.tweetToEpisode(tweet));
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const { data } = await axios.get(`${API_BASE}/tweets/${sourceId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: { 'tweet.fields': 'created_at,public_metrics,author_id' },
    });
    return this.tweetToEpisode(data.data);
  }

  async subscribeWebhook(): Promise<void> {
    throw new Error('Twitter webhook subscription requires Account Activity API approval (not implemented)');
  }

  validateWebhookSignature(): boolean {
    return false;
  }

  async processWebhook(): Promise<void> {
    throw new Error('Twitter webhooks not implemented');
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    return this.provider.publish(this.accessToken, content);
  }

  private tweetToEpisode(tweet: any): IEpisode {
    return {
      episode_id: crypto.randomUUID(),
      tenant_id: '',
      source_system: 'twitter',
      source_id: tweet.id,
      source_version: tweet.id,
      raw_pointer: `twitter://status/${tweet.id}`,
      parsed_content: tweet,
      author: tweet.author_id,
      created_at: new Date(tweet.created_at ?? Date.now()),
      ingested_at: new Date(),
    };
  }
}
