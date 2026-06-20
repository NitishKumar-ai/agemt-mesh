import { IEpisode } from '../models/episode';

export interface ConnectorConfig {
  enabled: boolean;
  poll_interval?: number;
  retry_policy?: RetryPolicy;
  webhook_secret?: string;
  identifier?: string;
  extra?: Record<string, any>;
}

export interface RetryPolicy {
  max_retries: number;
  backoff_factor: number;
  initial_delay: number;
  max_delay: number;
}

export interface Connector {
  name: string;
  config: ConnectorConfig;

  /**
   * Bootstrap the connector - fetch historical data
   */
  bootstrap(): Promise<void>;

  /**
   * Fetch changes since a given timestamp
   */
  fetchChanges(since: Date): Promise<IEpisode[]>;

  /**
   * Fetch a specific object by source ID
   */
  fetchObject(sourceId: string): Promise<IEpisode>;

  /**
   * Subscribe to webhooks if supported
   */
  subscribeWebhook(): Promise<void>;

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean;

  /**
   * Process webhook payload
   */
  processWebhook(payload: any): Promise<void>;

  supportsWebhook: boolean;
  webhookEndpoint?: string;
}