import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import * as crypto from 'crypto';

export class OutlookConnector implements Connector {
  name = 'outlook';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('outlook connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('outlook connector bootstrap started');
    await this.getConnectedAccount();
  }

  private async getConnectedAccount() {
    const response = await scalekitActions.getOrCreateConnectedAccount({
      connectionName: this.name,
      identifier: this.config.identifier!,
    });
    return response.connectedAccount;
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const connectedAccount = await this.getConnectedAccount();
      
      if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
        console.warn(`outlook is not connected for user ${this.config.identifier}. Status: ${connectedAccount?.status}`);
        const linkResponse = await scalekitActions.getAuthorizationLink({
          connectionName: this.name,
          identifier: this.config.identifier!,
        });
        console.warn(`🔗 User must click on this link to authorize outlook: ${linkResponse.link}`);
        return [];
      }

      // Generic proxy call using actions.request
      const result = await scalekitActions.request({
        connectionName: this.name,
        identifier: this.config.identifier!,
        path: '/v1/changes', // Placeholder path
        method: 'GET',
        queryParams: { since: since.toISOString() },
      });
      
      const items: any[] = (result as any)?.data || (result as any)?.items || [];
      episodes.push(...items.map((item) => this.itemToEpisode(item)));

    } catch (error) {
      console.error('Error fetching outlook changes via Scalekit:', error);
      throw error;
    }
    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    throw new Error('Method not implemented.');
  }

  private itemToEpisode(item: any): IEpisode {
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '',
      source_system: 'outlook',
      source_id: item.id || '',
      source_version: item.version || '',
      raw_pointer: '',
      parsed_content: item,
      author: '',
      created_at: new Date(),
      ingested_at: new Date(),
    };
    return episode;
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  async subscribeWebhook(): Promise<void> {}
  validateWebhookSignature(payload: string, signature: string): boolean { return true; }
  async processWebhook(payload: any): Promise<void> {}
}
