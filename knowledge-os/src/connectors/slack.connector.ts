
import { SourceConnector, SyncOptions } from './connector.interface.js';

export class SlackConnector implements SourceConnector {
  get name() { return 'slack'; }
  async sync(tenantId: string, options: SyncOptions): Promise<void> {
    // TODO: Implement Slack sync
  }
}
