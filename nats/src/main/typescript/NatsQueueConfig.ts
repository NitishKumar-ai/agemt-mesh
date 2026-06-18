/**
 * Configuration for the NatsQueue implementation.
 *
 * This config covers both the NATS connection parameters and the JetStream
 * stream/consumer tuning knobs that affect delivery, retention, and replay
 * behaviour.  All fields have sensible defaults so callers only need to supply
 * the NATS server URL in the simplest case.
 */
export interface NatsQueueConfig {
  /**
   * One or more NATS server URLs in the form `nats://host:port`.
   * Multiple entries enable the client to reconnect via a cluster.
   *
   * @default ['nats://localhost:4222']
   */
  servers?: string | string[];

  /**
   * Prefix prepended to every stream name so that different environments
   * (e.g. dev, staging, prod) can share the same NATS cluster without
   * stream-name collision.
   *
   * Stream name will be: `${streamPrefix}${sanitisedQueueName}`
   *
   * @default 'AGENTMESH_'
   */
  streamPrefix?: string;

  /**
   * How many copies of each message are kept across NATS cluster nodes.
   * Set to 1 for single-node local deployments; increase for HA.
   *
   * @default 1
   */
  replicas?: number;

  /**
   * Message retention limit (bytes) per stream.  0 = unlimited.
   *
   * @default 0
   */
  maxBytes?: number;

  /**
   * Maximum age of messages kept in the stream (milliseconds).
   * Messages older than this are automatically purged by the server.
   *
   * 0 = keep forever.
   *
   * @default 0
   */
  maxAge?: number;

  /**
   * Durable consumer name prefix.  Each queue gets a consumer named
   * `${durablePrefix}${sanitisedQueueName}`.
   *
   * @default 'worker_'
   */
  durablePrefix?: string;

  /**
   * How long the server waits before re-delivering an unacknowledged message
   * to another consumer (milliseconds).  Maps to JetStream `ack_wait`.
   *
   * @default 30_000  (30 seconds)
   */
  ackWaitMs?: number;

  /**
   * Maximum number of in-flight (fetched but not yet acked) messages per
   * fetch call.  Limits the batch size supplied to `pop` / `pollMessages`.
   *
   * @default 100
   */
  maxInFlight?: number;

  /**
   * Optional NATS credentials (NKey seed or JWT/NKey pair) used when
   * connecting to an auth-enabled NATS cluster.
   */
  credentials?: {
    /** A raw NKey seed string (64-char `S…`). */
    nkeySeed?: string;
    /** A user JWT string (starts with `eyJ`). */
    userJWT?: string;
  };
}

/**
 * Merge caller-supplied config with defaults, returning a fully-populated
 * config object that the NatsQueue constructor can use directly.
 */
export function resolveConfig(partial?: NatsQueueConfig): Required<NatsQueueConfig> {
  return {
    servers: partial?.servers ?? 'nats://localhost:4222',
    streamPrefix: partial?.streamPrefix ?? 'AGENTMESH_',
    replicas: partial?.replicas ?? 1,
    maxBytes: partial?.maxBytes ?? 0,
    maxAge: partial?.maxAge ?? 0,
    durablePrefix: partial?.durablePrefix ?? 'worker_',
    ackWaitMs: partial?.ackWaitMs ?? 30_000,
    maxInFlight: partial?.maxInFlight ?? 100,
    credentials: partial?.credentials ?? {},
  };
}
