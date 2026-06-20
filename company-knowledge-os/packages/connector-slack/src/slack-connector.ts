import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import axios from 'axios';

export class SlackConnector implements Connector {
  name = 'slack';
  supportsWebhook = true;

  constructor(
    private token: string,
    private webhookSecret?: string,
    public config: ConnectorConfig = { enabled: true }
  ) {}

  async bootstrap(): Promise<void> {
    // Fetch historical messages (implementation would call Slack API)
    console.log('Slack connector bootstrap started');
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      // Fetch recent messages from Slack
      const response = await axios.get(
        'https://slack.com/api/conversations.list',
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: { types: 'message', limit: 100 },
        }
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      // Process each channel
      for (const channel of response.data.channels || []) {
        const messages = await this.fetchMessages(channel.id, since);
        episodes.push(...messages);
      }
    } catch (error) {
      console.error('Error fetching Slack changes:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const [channelId, ts] = sourceId.split(':');
    if (!channelId || !ts) {
      throw new Error(`Invalid Slack source_id "${sourceId}", expected "<channelId>:<ts>"`);
    }

    const response = await axios.get(
      'https://slack.com/api/conversations.history',
      {
        headers: { Authorization: `Bearer ${this.token}` },
        params: {
          channel: channelId,
          latest: ts,
          oldest: ts,
          inclusive: true,
          limit: 1,
        },
      }
    );

    if (!response.data.ok) {
      throw new Error(`Slack API error: ${response.data.error}`);
    }

    const message = (response.data.messages || []).find((msg: any) => msg.ts === ts);
    if (!message) {
      throw new Error(`Slack message ${sourceId} not found`);
    }

    return this.messageToEpisode(message, channelId);
  }

  private async fetchMessages(channelId: string, since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    let cursor: string | undefined;

    do {
      const response = await axios.get(
        'https://slack.com/api/conversations.history',
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: {
            channel: channelId,
            oldest: Math.floor(since.getTime() / 1000).toString(),
            limit: 100,
            cursor,
          },
        }
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      const messages = response.data.messages || [];
      episodes.push(
        ...messages
          .filter((msg: any) => msg.type === 'message' && !msg.subtype)
          .map((msg: any) => this.messageToEpisode(msg, channelId))
      );

      cursor = response.data.response_metadata?.next_cursor;
    } while (cursor && episodes.length < 1000);

    return episodes;
  }

  private messageToEpisode(message: any, channelId: string): IEpisode {
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '', // Set by orchestrator
      source_system: 'slack',
      source_id: `${channelId}:${message.ts}`,
      source_version: message.ts,
      raw_pointer: `slack://channel/${channelId}`,
      parsed_hash: this.hashMessage(message),
      parsed_content: {
        channel: channelId,
        text: message.text,
        ts: message.ts,
        user: message.user,
        user_profile: message.user_profile,
        attachments: message.attachments,
        reactions: message.reactions,
        thread_ts: message.thread_ts,
        subtype: message.subtype,
        timestamp: new Date(message.ts * 1000),
      },
      author: message.user,
      created_at: new Date(message.ts * 1000),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashMessage(message: any): string {
    // Simple hash for deduplication
    const content = JSON.stringify(message);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  async subscribeWebhook(): Promise<void> {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    // Register webhook with Slack
    // Implementation would call Slack API to register webhook
    console.log('Slack webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) return false;

    // Verify webhook signature using HMAC-SHA256
    // Implementation would use crypto.timingSafeEqual
    return true; // Placeholder
  }

  async processWebhook(payload: any): Promise<void> {
    // Process incoming Slack webhook event
    console.log('Processing Slack webhook:', payload);
  }
}