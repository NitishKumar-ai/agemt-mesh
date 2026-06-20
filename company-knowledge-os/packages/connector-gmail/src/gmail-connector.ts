import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import crypto from 'crypto';

export class GmailConnector implements Connector {
  name = 'gmail';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('Gmail connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('Gmail connector bootstrap started');
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
      console.warn(`Gmail is not connected for user ${this.config.identifier}. Status: ${connectedAccount?.status}`);
      const linkResponse = await scalekitActions.getAuthorizationLink({
        connectionName: this.name,
        identifier: this.config.identifier!,
      });
      console.warn(`🔗 User must click on this link to authorize Gmail: ${linkResponse.link}`);
      throw new Error('Gmail not authorized');
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
      const data = await this.executeToolWithAuth('gmail_fetch_mails', {
        query: `after:${Math.floor(since.getTime() / 1000)}`,
        max_results: 100,
      });

      const messages: any[] = data?.messages || [];
      episodes.push(...messages.map((msg) => this.messageToEpisode(msg)));

    } catch (error) {
      if (error instanceof Error && error.message === 'Gmail not authorized') {
        return [];
      }
      console.error('Error fetching Gmail changes via Scalekit:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    try {
      const data = await this.executeToolWithAuth('gmail_fetch_mail', {
        id: sourceId,
      });
      const message = data?.message || data; // handle direct or wrapped message payload
      if (!message) {
        throw new Error(`Gmail message ${sourceId} not found`);
      }
      return this.messageToEpisode(message);
    } catch (error) {
      if (error instanceof Error && error.message === 'Gmail not authorized') {
        throw new Error('Gmail not authorized');
      }
      console.error('Error fetching Gmail object via Scalekit:', error);
      throw error;
    }
  }

  private messageToEpisode(msg: any): IEpisode {
    const internalDate = msg.internalDate ? new Date(parseInt(msg.internalDate)) : new Date();
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
        internalDate,
        payload: msg.payload, // Will contain structured data from Scalekit
      },
      author: msg.sender || '', 
      created_at: internalDate,
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashMessage(msg: any): string {
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
    console.log('Gmail webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    return true;
  }

  async processWebhook(payload: any): Promise<void> {
    console.log('Processing Gmail webhook:', payload);
  }
}