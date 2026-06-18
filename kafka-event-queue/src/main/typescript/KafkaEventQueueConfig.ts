/**
 * Configuration for the KafkaEventQueue.
 *
 * All settings map directly to KafkaJS producer/consumer/admin options so
 * that callers can tune behaviour without subclassing.
 */
export interface KafkaEventQueueConfig {
  /**
   * One or more Kafka bootstrap broker addresses in "host:port" format.
   * Multiple brokers increase fault-tolerance during initial connection.
   */
  brokers: string[];

  /**
   * Kafka client ID reported in broker logs and JMX metrics.
   * Defaults to "agentmesh-kafka-event-queue".
   */
  clientId?: string;

  /**
   * Consumer group ID used for all topic subscriptions created by this
   * instance. All instances that share a group ID will cooperatively
   * consume the same set of partitions.
   * Defaults to "agentmesh-event-queue-group".
   */
  groupId?: string;

  /**
   * Prefix prepended to every Kafka topic name derived from a queue name.
   * E.g. with prefix "agentmesh_" a queue named "workflow_events" maps to
   * topic "agentmesh_workflow_events".
   * Defaults to "agentmesh_".
   */
  topicPrefix?: string;

  /**
   * Number of partitions to create when auto-creating a topic.
   * Defaults to 1.
   */
  defaultNumPartitions?: number;

  /**
   * Replication factor for auto-created topics.
   * Defaults to 1. Set higher in multi-broker production clusters.
   */
  defaultReplicationFactor?: number;

  /**
   * Whether the consumer should start reading from the beginning of each
   * topic partition when no committed offset exists.
   * Defaults to false (reads from the latest offset).
   */
  fromBeginning?: boolean;

  /**
   * Maximum time in milliseconds a poll() call will wait for messages before
   * returning an empty list. Used by the internal consumer loop.
   * Defaults to 1000 ms.
   */
  pollTimeoutMs?: number;

  /**
   * Maximum number of messages returned per poll() call per queue.
   * Defaults to 10.
   */
  maxPollRecords?: number;

  /**
   * Connection timeout in milliseconds for the Kafka client.
   * Defaults to 3000 ms.
   */
  connectionTimeoutMs?: number;

  /**
   * Request timeout in milliseconds for the Kafka client.
   * Defaults to 30000 ms.
   */
  requestTimeoutMs?: number;

  /**
   * SSL configuration passed directly to KafkaJS.
   * Leave undefined to connect without TLS.
   */
  ssl?: boolean | object;

  /**
   * SASL authentication configuration passed directly to KafkaJS.
   * Leave undefined for unauthenticated connections.
   */
  sasl?: object;
}

/** Resolved configuration with all optional fields filled in. */
export interface ResolvedKafkaEventQueueConfig extends Required<KafkaEventQueueConfig> {}

/**
 * Merges caller-supplied partial config with production-safe defaults.
 *
 * Algorithm:
 *   1. Apply field-by-field defaults using nullish coalescing.
 *   2. Return a fully resolved config object so all downstream code can
 *      access fields without optional-chaining noise.
 */
export function resolveConfig(cfg: KafkaEventQueueConfig): ResolvedKafkaEventQueueConfig {
  return {
    brokers: cfg.brokers,
    clientId: cfg.clientId ?? 'agentmesh-kafka-event-queue',
    groupId: cfg.groupId ?? 'agentmesh-event-queue-group',
    topicPrefix: cfg.topicPrefix ?? 'agentmesh_',
    defaultNumPartitions: cfg.defaultNumPartitions ?? 1,
    defaultReplicationFactor: cfg.defaultReplicationFactor ?? 1,
    fromBeginning: cfg.fromBeginning ?? false,
    pollTimeoutMs: cfg.pollTimeoutMs ?? 1000,
    maxPollRecords: cfg.maxPollRecords ?? 10,
    connectionTimeoutMs: cfg.connectionTimeoutMs ?? 3000,
    requestTimeoutMs: cfg.requestTimeoutMs ?? 30000,
    ssl: cfg.ssl ?? false,
    sasl: cfg.sasl ?? {},
  };
}
