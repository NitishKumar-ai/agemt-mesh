import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import { google } from 'googleapis';

export class GmailConnector implements Connector {
  name = 'gmail';
  supportsWebhook = true;
  config: ConnectorConfig;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
    config: ConnectorConfig = { enabled: true }
  ) {
    this.config = config;
  }

  async bootstrap(): Promise<void> {
    // Initialize OAuth client and fetch historical emails
    console.log('Gmail connector bootstrap started');
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      const auth = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        'https://oauth2.googleapis.com/token'
      );
      auth.setCredentials({ refresh_token: this.refreshToken });

      const gmail = google.gmail({ version: 'v1', auth });

      // List emails since the given date
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${Math.floor(since.getTime() / 1000)}`,
        maxResults: 100,
      });

      const messages = response.data.messages || [];
      episodes.push(...messages.map((msg) => this.messageToEpisode(msg)));

    } catch (error) {
      console.error('Error fetching Gmail changes:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    try {
      const auth = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        'https://oauth2.googleapis.com/token'
      );
      auth.setCredentials({ refresh_token: this.refreshToken });

      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: sourceId,
      });

      return this.messageToEpisode(response.data);
    } catch (error) {
      console.error('Error fetching Gmail object:', error);
      throw error;
    }
  }

  private messageToEpisode(msg: any): IEpisode {
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '', // Set by orchestrator
      source_system: 'gmail',
      source_id: msg.id || '',
      source_version: msg.id || '',
      raw_pointer: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
      parsed_hash: this.hashMessage(msg),
      parsed_content: {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds,
        snippet: msg.snippet,
        historyId: msg.historyId,
        internalDate: new Date(parseInt(msg.internalDate || '0')),
        payload: msg.payload,
      },
      author: '', // Extracted from headers
      created_at: new Date(parseInt(msg.internalDate || '0')),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashMessage(msg: any): string {
    // Simple hash for deduplication
    const content = JSON.stringify(msg);
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
    // Register webhook with Gmail
    // Implementation would use Gmail API
    console.log('Gmail webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    // Placeholder implementation
    return true;
  }

  async processWebhook(payload: any): Promise<void> {
    // Process incoming Gmail webhook event
    console.log('Processing Gmail webhook:', payload);
  }
}