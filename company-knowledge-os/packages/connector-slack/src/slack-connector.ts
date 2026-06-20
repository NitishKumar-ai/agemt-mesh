import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import crypto from 'crypto';

export class SlackConnector implements Connector {
  name = 'slack';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('Slack connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('Slack connector bootstrap started');
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
      console.warn(`Slack is not connected for user ${this.config.identifier}. Status: ${connectedAccount?.status}`);
      const linkResponse = await scalekitActions.getAuthorizationLink({
        connectionName: this.name,
        identifier: this.config.identifier!,
      });
      console.warn(`🔗 User must click on this link to authorize Slack: ${linkResponse.link}`);
      throw new Error('Slack not authorized');
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
      // In Scalekit, we'd query Slack channels, then messages.
      // This is a generic representation assuming a `slack_fetch_messages` tool
      let cursor: string | undefined = undefined;
      do {
        const data: any = await this.executeToolWithAuth('slack_fetch_messages', {
          oldest: Math.floor(since.getTime() / 1000).toString(),
          limit: 100,
          cursor: cursor,
        });

        const channels = data?.channels || [];
        for (const channel of channels) {
          const messages = channel.messages || [];
          episodes.push(
            ...messages
              .filter((msg: any) => msg.type === 'message' && !msg.subtype)
              .map((msg: any) => this.messageToEpisode(msg, channel.id))
          );
        }
        cursor = data?.response_metadata?.next_cursor;
      } while (cursor);
    } catch (error) {
      if (error instanceof Error && error.message === 'Slack not authorized') {
        return [];
      }
      console.error('Error fetching Slack changes via Scalekit:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const [channelId, ts] = sourceId.split(':');
    if (!channelId || !ts) {
      throw new Error(`Invalid Slack source_id "${sourceId}", expected "<channelId>:<ts>"`);
    }

    const data: any = await this.executeToolWithAuth('slack_fetch_message', {
      channel: channelId,
      timestamp: ts,
    });

    const message = data?.message;
    if (!message) {
      throw new Error(`Slack message ${sourceId} not found`);
    }

    return this.messageToEpisode(message, channelId);
  }

  private messageToEpisode(message: any, channelId: string): IEpisode {
    const tsNumber = parseFloat(message.ts);
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
        timestamp: new Date(tsNumber * 1000),
      },
      author: message.user,
      created_at: new Date(tsNumber * 1000),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashMessage(message: any): string {
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
    if (!this.config.webhook_secret) {
      throw new Error('Webhook secret not configured');
    }
    console.log('Slack webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhook_secret) return false;
    try {
      const expected = crypto
        .createHmac('sha256', this.config.webhook_secret)
        .update(payload)
        .digest('hex');
      // Assume signature is provided without prefix, or compare properly
      const sigBuf = Buffer.from(signature.replace(/^v0=/, ''));
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  async processWebhook(payload: any): Promise<void> {
    console.log('Processing Slack webhook:', payload);
  }
}