import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import crypto from 'crypto';

export class NotionConnector implements Connector {
  name = 'notion';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('Notion connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('Notion connector bootstrap started');
    await this.getConnectedAccount();
  }

  private async getConnectedAccount() {
    const response = await scalekitActions.getOrCreateConnectedAccount({
      connectionName: this.name,
      identifier: this.config.identifier!,
    });
    return response.connectedAccount;
  }

  private async executeToolWithAuth(toolName: string, toolInput: any) {
    const connectedAccount = await this.getConnectedAccount();
    
    if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
      console.warn(`Notion is not connected for user ${this.config.identifier}. Status: ${connectedAccount?.status}`);
      const linkResponse = await scalekitActions.getAuthorizationLink({
        connectionName: this.name,
        identifier: this.config.identifier!,
      });
      console.warn(`🔗 User must click on this link to authorize Notion: ${linkResponse.link}`);
      throw new Error('Notion not authorized');
    }

    const toolResponse = await scalekitActions.executeTool({
      toolName,
      connectedAccountId: connectedAccount?.id,
      toolInput,
    });
    
    return toolResponse.data;
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      let hasMore = true;
      let startCursor: string | undefined = undefined;

      while (hasMore) {
        const data: any = await this.executeToolWithAuth('notion_search', {
          filter: {
            timestamp: 'last_edited_time',
            last_edited_time: {
              after: since.toISOString(),
            },
          },
          page_size: 100,
          start_cursor: startCursor,
        });

        const results = data?.results || [];
        episodes.push(...results.map((page: any) => this.pageToEpisode(page)));
        
        hasMore = data?.has_more || false;
        startCursor = data?.next_cursor;
      }

    } catch (error) {
      if (error instanceof Error && error.message === 'Notion not authorized') {
        return [];
      }
      console.error('Error fetching Notion changes via Scalekit:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const data: any = await this.executeToolWithAuth('notion_fetch_page', {
      page_id: sourceId
    });
    
    if (!data?.page && !data) {
      throw new Error(`Notion page ${sourceId} not found`);
    }

    return this.pageToEpisode(data.page || data);
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
        last_edited_time: new Date(page.last_edited_time || new Date()),
        created_time: new Date(page.created_time || new Date()),
        parent: page.parent,
        archived: page.archived,
        properties: page.properties,
        children: page.children,
      },
      author: '', // Extracted from page properties
      created_at: new Date(page.created_time || page.last_edited_time || new Date()),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashPage(page: any): string {
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
    console.log('Notion webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhook_secret) return false;
    try {
      const expected = crypto
        .createHmac('sha256', this.config.webhook_secret)
        .update(payload)
        .digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  async processWebhook(payload: any): Promise<void> {
    console.log('Processing Notion webhook:', payload);
  }
}