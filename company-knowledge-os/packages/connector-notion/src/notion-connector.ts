import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import axios from 'axios';

export class NotionConnector implements Connector {
  name = 'notion';
  supportsWebhook = true;
  config: ConnectorConfig;

  constructor(
    private token: string,
    config: ConnectorConfig = { enabled: true }
  ) {
    this.config = config;
  }

  async bootstrap(): Promise<void> {
    // Fetch historical pages
    console.log('Notion connector bootstrap started');
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      // Fetch pages modified since the given date
      const response = await axios.get(
        'https://api.notion.com/v1/search',
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Notion-Version': '2022-06-28',
          },
          params: {
            filter: {
              timestamp: 'last_edited_time',
              last_edited_time: {
                after: since.toISOString(),
              },
            },
            page_size: 100,
          },
        }
      );

      const results = response.data.results || [];
      episodes.push(...results.map((page: any) => this.pageToEpisode(page)));

    } catch (error) {
      console.error('Error fetching Notion changes:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    try {
      const response = await axios.get(
        `https://api.notion.com/v1/pages/${sourceId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Notion-Version': '2022-06-28',
          },
        }
      );

      return this.pageToEpisode(response.data);
    } catch (error) {
      console.error('Error fetching Notion object:', error);
      throw error;
    }
  }

  private pageToEpisode(page: any): IEpisode {
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '', // Set by orchestrator
      source_system: 'notion',
      source_id: page.id || '',
      source_version: page.last_edited_time || '',
      raw_pointer: page.url || '',
      parsed_hash: this.hashPage(page),
      parsed_content: {
        id: page.id,
        title: page.title,
        icon: page.icon,
        cover: page.cover,
        url: page.url,
        last_edited_time: new Date(page.last_edited_time),
        created_time: new Date(page.created_time),
        parent: page.parent,
        archived: page.archived,
        properties: page.properties,
        children: page.children,
      },
      author: '', // Extracted from page properties
      created_at: new Date(page.created_time || page.last_edited_time),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashPage(page: any): string {
    // Simple hash for deduplication
    const content = JSON.stringify(page);
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
    // Register webhook with Notion
    // Notion webhooks require manual setup via dashboard
    console.log('Notion webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    // Placeholder implementation
    return true;
  }

  async processWebhook(payload: any): Promise<void> {
    // Process incoming Notion webhook event
    console.log('Processing Notion webhook:', payload);
  }
}