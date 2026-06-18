/**
 * NatsQueue — a QueueDAO implementation backed by NATS JetStream.
 *
 * Design overview
 * ---------------
 * Each logical queue name maps to one JetStream *stream* whose subject is the
 * sanitised queue name.  A single durable pull-consumer per stream is created
 * on demand; this consumer is reused across all `pop` / `pollMessages` calls.
 *
 * Message lifecycle
 * -----------------
 *  push         → js.publish(subject, payload)
 *  pop          → consumer.fetch(count, timeout)  → msg.nak() to return
 *  ack          → stored JetStream message reference → msg.ack()
 *  remove       → identical to ack — acknowledged messages are not redelivered
 *  getSize      → jsm.streams.info(streamName).state.messages
 *  flush        → jsm.streams.purge(streamName)
 *  queuesDetail → iterate all managed streams and report pending counts
 *
 * In-memory unack store
 * ---------------------
 * When messages are fetched they are held in `pendingAcks`:
 *   Map<queueName, Map<messageId, JsMsg>>
 *
 * The `ack` and `remove` methods look up the raw JetStream message object and
 * call `msg.ack()` on it.  `setUnackTimeout` / `setUnackTimeoutIfShorter`
 * call `msg.working()` to signal in-progress processing to the server.
 *
 * JetStream compatibility
 * -----------------------
 * Requires the `nats` npm package >= 2.x and a NATS server >= 2.6 with
 * JetStream enabled (`--jetstream` flag or `jetstream {}` block in the
 * server config file).
 */

import {
  connect,
  type NatsConnection,
  type JetStreamManager,
  type JetStreamClient,
  type JsMsg,
  StringCodec,
  AckPolicy,
  RetentionPolicy,
  StorageType,
  DeliverPolicy,
  headers,
} from 'nats';
import type { QueueDAO } from '@agentmesh/common-persistence';
import type { Message } from '@agentmesh/common';
import { type NatsQueueConfig, resolveConfig } from './NatsQueueConfig.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Tracks in-flight JetStream messages awaiting ack/nak. */
type PendingMap = Map<string, JsMsg>;

/** Shape of the JSON body stored inside each NATS message. */
interface MessageBody {
  id: string;
  priority: number;
  payload?: string;
  timeout: number;
  offsetTimeInSecond: number;
}

// ---------------------------------------------------------------------------
// NatsQueue
// ---------------------------------------------------------------------------

export class NatsQueue implements QueueDAO {
  private readonly config: Required<NatsQueueConfig>;

  /** StringCodec encodes/decodes message payloads as UTF-8 strings. */
  private readonly codec = StringCodec();

  /** Lazily initialised NATS connection. */
  private connection: NatsConnection | null = null;

  /** Lazily initialised JetStream client (messaging operations). */
  private js: JetStreamClient | null = null;

  /** Lazily initialised JetStream manager (admin / stream-level operations). */
  private jsm: JetStreamManager | null = null;

  /**
   * Two-level map: queueName → (messageId → raw JetStream message).
   * Populated on pop/pollMessages; entries removed on ack/remove.
   */
  private readonly pendingAcks = new Map<string, PendingMap>();

  /**
   * Tracks which streams have already been provisioned during this process
   * lifetime.  Avoids redundant AddStream calls on every operation.
   */
  private readonly provisionedStreams = new Set<string>();

  constructor(config?: NatsQueueConfig) {
    this.config = resolveConfig(config);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Establish a NATS connection and initialise the JetStream client and
   * JetStreamManager.  Idempotent — safe to call multiple times.
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.connection = await connect({
      servers: this.config.servers,
    });

    this.js = this.connection.jetstream();
    this.jsm = await this.connection.jetstreamManager();
  }

  /**
   * Drain all in-flight subscriptions and close the NATS connection.
   * The instance must not be used after this call.
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.drain();
      this.connection = null;
      this.js = null;
      this.jsm = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Lazily connect and return the JetStream client. */
  private async getJs(): Promise<JetStreamClient> {
    if (!this.js) {
      await this.connect();
    }
    return this.js!;
  }

  /** Lazily connect and return the JetStreamManager. */
  private async getJsm(): Promise<JetStreamManager> {
    if (!this.jsm) {
      await this.connect();
    }
    return this.jsm!;
  }

  /**
   * Sanitise a queue name so it is safe to use as a NATS subject.
   * NATS subjects must not contain spaces; dots and hyphens are allowed.
   */
  private sanitise(queueName: string): string {
    return queueName.replace(/\s+/g, '_');
  }

  /**
   * Derive the JetStream stream name from a logical queue name.
   * Example: "workflow_tasks" → "AGENTMESH_workflow_tasks"
   */
  private streamName(queueName: string): string {
    return `${this.config.streamPrefix}${this.sanitise(queueName)}`;
  }

  /**
   * Derive the NATS subject from a logical queue name.
   * Each stream captures all messages on this single subject.
   */
  private subject(queueName: string): string {
    return this.sanitise(queueName);
  }

  /**
   * Derive the durable consumer name from a logical queue name.
   */
  private consumerName(queueName: string): string {
    return `${this.config.durablePrefix}${this.sanitise(queueName)}`;
  }

  /**
   * Ensure that a JetStream stream and a durable pull-consumer exist for the
   * given queue name.  Creates them if necessary.  This method is idempotent.
   *
   * Stream configuration:
   *  - Retention: Workqueue — messages are removed after all consumers ack them.
   *  - Storage: File — survives server restarts.
   *  - Replicas: configurable (default 1).
   *
   * Consumer configuration:
   *  - AckPolicy: Explicit — every message must be individually acked.
   *  - DeliverPolicy: All — start from the oldest available message.
   */
  private async ensureStream(queueName: string): Promise<void> {
    const sName = this.streamName(queueName);
    if (this.provisionedStreams.has(sName)) {
      return;
    }

    const jsm = await this.getJsm();
    const subj = this.subject(queueName);
    const durable = this.consumerName(queueName);

    // Upsert the stream — the server returns an error if a stream with the
    // same name already exists and has different configuration.  We treat
    // "already exists" errors as success (idempotent).
    try {
      await jsm.streams.add({
        name: sName,
        subjects: [subj],
        retention: RetentionPolicy.Workqueue,
        storage: StorageType.File,
        num_replicas: this.config.replicas,
        max_bytes: this.config.maxBytes === 0 ? -1 : this.config.maxBytes,
        max_age: this.config.maxAge === 0 ? 0 : this.config.maxAge * 1_000_000, // convert ms → ns
      });
    } catch (err: unknown) {
      if (!isAlreadyExistsError(err)) {
        throw err;
      }
    }

    // Upsert the durable pull-consumer.
    try {
      await jsm.consumers.add(sName, {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        ack_wait: this.config.ackWaitMs * 1_000_000, // convert ms → ns
        max_ack_pending: this.config.maxInFlight,
      });
    } catch (err: unknown) {
      if (!isAlreadyExistsError(err)) {
        throw err;
      }
    }

    this.provisionedStreams.add(sName);
  }

  /**
   * Get or initialise the in-flight pending-ack map for a queue.
   */
  private pendingFor(queueName: string): PendingMap {
    let map = this.pendingAcks.get(queueName);
    if (!map) {
      map = new Map<string, JsMsg>();
      this.pendingAcks.set(queueName, map);
    }
    return map;
  }

  /**
   * Build NATS message headers from a plain key-value record.
   * Returns undefined when the record is empty.
   */
  private buildHeaders(entries: Record<string, string>): ReturnType<typeof headers> | undefined {
    const keys = Object.keys(entries);
    if (keys.length === 0) {
      return undefined;
    }
    const h = headers();
    for (const [k, v] of Object.entries(entries)) {
      h.set(k, v);
    }
    return h;
  }

  /**
   * Encode a MessageBody as a UTF-8 JSON string for publishing.
   */
  private encodeBody(body: MessageBody): Uint8Array {
    return this.codec.encode(JSON.stringify(body));
  }

  /**
   * Decode a raw JetStream message into an agentmesh Message.
   *
   * Falls back to the JetStream sequence number as the message ID if the body
   * cannot be parsed (e.g. messages published by external producers).
   */
  private decodeMessage(raw: JsMsg): Message {
    try {
      const body = JSON.parse(this.codec.decode(raw.data)) as Partial<MessageBody>;
      return {
        id: typeof body.id === 'string' ? body.id : String(raw.info.streamSequence),
        payload: typeof body.payload === 'string' ? body.payload : undefined,
        priority: typeof body.priority === 'number' ? body.priority : 0,
        timeout: typeof body.timeout === 'number' ? body.timeout : 0,
        receipt: String(raw.info.streamSequence),
      };
    } catch {
      // Non-JSON payload — surface the raw bytes as the payload field.
      return {
        id: String(raw.info.streamSequence),
        payload: this.codec.decode(raw.data),
        priority: 0,
        timeout: 0,
        receipt: String(raw.info.streamSequence),
      };
    }
  }

  // -------------------------------------------------------------------------
  // QueueDAO — publish
  // -------------------------------------------------------------------------

  /**
   * Publish a single message to the queue.
   *
   * `offsetTimeInSecond` is stored in the message body and as a
   * `X-Delay-Seconds` header for consumers that implement delayed delivery.
   * NATS JetStream does not natively support scheduled delivery, so consumers
   * must check this field and re-nak with a delay if needed.
   *
   * `priority` is stored in the body and a `X-Priority` header.  JetStream
   * does not have priority lanes; ordering is strictly FIFO within a stream.
   *
   * The `msgID` option enables server-side deduplication within the stream's
   * deduplication window (default 2 minutes).
   */
  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority = 0,
  ): Promise<void> {
    await this.ensureStream(queueName);
    const js = await this.getJs();

    await js.publish(
      this.subject(queueName),
      this.encodeBody({ id, priority, offsetTimeInSecond, timeout: 0 }),
      {
        msgID: id,
        headers: this.buildHeaders({
          'X-Priority': String(priority),
          'X-Delay-Seconds': String(offsetTimeInSecond),
        }),
      },
    );
  }

  /**
   * Publish a batch of Message objects.
   *
   * Each message is published individually because the nats.js client does not
   * offer a native batch-publish API.
   */
  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    await this.ensureStream(queueName);
    const js = await this.getJs();
    const subj = this.subject(queueName);

    for (const msg of messages) {
      await js.publish(
        subj,
        this.encodeBody({
          id: msg.id ?? '',
          priority: msg.priority ?? 0,
          payload: msg.payload,
          timeout: msg.timeout ?? 0,
          offsetTimeInSecond: 0,
        }),
        {
          msgID: msg.id,
          headers: this.buildHeaders({
            'X-Priority': String(msg.priority ?? 0),
          }),
        },
      );
    }
  }

  /**
   * Publish a message only if no message with the same `id` is already queued.
   *
   * JetStream deduplicates by `msgID` within the stream's dedup window.  The
   * returned `PubAck` has `duplicate: true` when the server rejected a
   * duplicate.
   *
   * Returns `true` when a new message was enqueued, `false` for duplicates.
   */
  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority = 0,
  ): Promise<boolean> {
    await this.ensureStream(queueName);
    const js = await this.getJs();

    const ack = await js.publish(
      this.subject(queueName),
      this.encodeBody({ id, priority, offsetTimeInSecond, timeout: 0 }),
      {
        msgID: id,
        headers: this.buildHeaders({
          'X-Priority': String(priority),
          'X-Delay-Seconds': String(offsetTimeInSecond),
        }),
      },
    );

    return !ack.duplicate;
  }

  // -------------------------------------------------------------------------
  // QueueDAO — consume
  // -------------------------------------------------------------------------

  /**
   * Fetch up to `count` message IDs from the queue.
   *
   * Uses a durable pull-consumer to fetch messages.  The raw JetStream message
   * references are retained in `pendingAcks` until `ack()` or `remove()` is
   * called.  Messages that are neither acked nor nak-ed within `ackWaitMs`
   * will be automatically redelivered by the server.
   *
   * `timeout` is in milliseconds and controls how long the fetch waits when
   * fewer than `count` messages are available.
   */
  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const messages = await this.pollMessages(queueName, count, timeout);
    return messages.map((m) => m.id ?? '').filter((id) => id.length > 0);
  }

  /**
   * Fetch up to `count` Message objects from the queue.
   *
   * See `pop` for full semantics.  The `payload`, `priority`, and `receipt`
   * fields are populated from the stored message body.
   */
  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    await this.ensureStream(queueName);
    const js = await this.getJs();
    const sName = this.streamName(queueName);
    const durable = this.consumerName(queueName);
    const pending = this.pendingFor(queueName);

    const consumer = await js.consumers.get(sName, durable);
    const fetched: Message[] = [];

    const iter = await consumer.fetch({
      max_messages: count,
      expires: timeout,
    });

    for await (const raw of iter) {
      const msg = this.decodeMessage(raw);
      // Only store pending reference when we have a usable id.
      if (msg.id) {
        pending.set(msg.id, raw);
      }
      fetched.push(msg);
    }

    return fetched;
  }

  // -------------------------------------------------------------------------
  // QueueDAO — acknowledgement
  // -------------------------------------------------------------------------

  /**
   * Acknowledge that a message has been successfully processed.
   *
   * Looks up the raw JetStream message in the pending map and calls
   * `msg.ack()`.  Returns `true` on success; `false` when the message was not
   * found (already acked, expired, or never fetched in this process).
   */
  async ack(queueName: string, messageId: string): Promise<boolean> {
    const raw = this.pendingFor(queueName).get(messageId);
    if (!raw) {
      return false;
    }
    raw.ack();
    this.pendingFor(queueName).delete(messageId);
    return true;
  }

  /**
   * Remove a message from the queue.
   *
   * If the message is currently in-flight (in the pending-ack map) it is
   * acknowledged so the server discards it.  Otherwise this is a no-op.
   */
  async remove(queueName: string, messageId: string): Promise<void> {
    const raw = this.pendingFor(queueName).get(messageId);
    if (raw) {
      raw.ack();
      this.pendingFor(queueName).delete(messageId);
    }
  }

  /**
   * Signal to the server that processing is still in progress, resetting the
   * ack deadline.  Uses `msg.working()` which sends a progress heartbeat.
   *
   * `unackTimeout` is accepted for interface compatibility but ignored because
   * JetStream's working() always uses the consumer's `ack_wait` value.
   */
  async setUnackTimeout(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    void unackTimeout;
    const raw = this.pendingFor(queueName).get(messageId);
    if (!raw) {
      return false;
    }
    raw.working();
    return true;
  }

  /**
   * Extend the ack deadline only when the requested timeout is shorter than
   * the configured `ackWaitMs`.
   *
   * This mirrors the semantics of the original Java implementation where a
   * shorter unack timeout was used to accelerate redelivery scheduling.
   */
  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    if (unackTimeout >= this.config.ackWaitMs) {
      return false;
    }
    return this.setUnackTimeout(queueName, messageId, unackTimeout);
  }

  // -------------------------------------------------------------------------
  // QueueDAO — queue metadata / management
  // -------------------------------------------------------------------------

  /**
   * Return the number of messages currently in the stream (server-side).
   * Returns 0 if the stream has not been provisioned yet.
   */
  async getSize(queueName: string): Promise<number> {
    const jsm = await this.getJsm();
    try {
      const info = await jsm.streams.info(this.streamName(queueName));
      return info.state.messages;
    } catch {
      return 0;
    }
  }

  /**
   * Purge all messages from the stream without deleting it or the consumer.
   * Useful for test teardown or administrative queue resets.
   */
  async flush(queueName: string): Promise<void> {
    await this.ensureStream(queueName);
    const jsm = await this.getJsm();
    await jsm.streams.purge(this.streamName(queueName));
  }

  /**
   * Return a map of `{ queueName → serverPendingCount }` for every queue that
   * has been provisioned in the current process.
   */
  async queuesDetail(): Promise<Record<string, number>> {
    const jsm = await this.getJsm();
    const result: Record<string, number> = {};

    for (const sName of this.provisionedStreams) {
      try {
        const info = await jsm.streams.info(sName);
        const qName = sName.slice(this.config.streamPrefix.length);
        result[qName] = info.state.messages;
      } catch {
        // Stream may have been deleted externally — skip silently.
      }
    }

    return result;
  }

  /**
   * Return verbose queue details including both server-side message counts and
   * the number of messages currently held in the client-side pending-ack map.
   *
   * Shape:
   * ```
   * {
   *   "workflow_tasks": {
   *     "messages": {
   *       "serverPending": 42,
   *       "clientAckPending": 5
   *     }
   *   }
   * }
   * ```
   */
  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    const jsm = await this.getJsm();
    const result: Record<string, Record<string, Record<string, number>>> = {};

    for (const sName of this.provisionedStreams) {
      try {
        const info = await jsm.streams.info(sName);
        const qName = sName.slice(this.config.streamPrefix.length);
        const clientAckPending = this.pendingAcks.get(qName)?.size ?? 0;

        result[qName] = {
          messages: {
            serverPending: info.state.messages,
            clientAckPending,
          },
        };
      } catch {
        // Skip streams deleted externally.
      }
    }

    return result;
  }

  /**
   * Drop all client-side pending-ack references for a queue.
   *
   * JetStream automatically redelivers messages whose `ack_wait` has elapsed.
   * Calling this method forces the client to forget about any stale JsMsg
   * handles, preventing double-ack scenarios after a process restart.
   */
  async processUnacks(queueName: string): Promise<void> {
    this.pendingAcks.delete(queueName);
  }

  // -------------------------------------------------------------------------
  // QueueDAO — postpone / peek / contains
  // -------------------------------------------------------------------------

  /**
   * Postpone a message by nak-ing it with a delay so the server re-delivers
   * after `postponeDurationInSeconds` seconds.
   *
   * `priority` is accepted for interface compatibility; JetStream does not
   * support per-message priority lanes.
   *
   * Returns `true` when the pending message was found and postponed.
   */
  async postpone(
    queueName: string,
    messageId: string,
    priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    void priority;
    const raw = this.pendingFor(queueName).get(messageId);
    if (!raw) {
      return false;
    }
    // nak(delayMs) instructs the server to redeliver after the given delay.
    raw.nak(postponeDurationInSeconds * 1000);
    this.pendingFor(queueName).delete(messageId);
    return true;
  }

  /**
   * Nak an in-flight message immediately to trigger redelivery.
   *
   * JetStream does not expose a per-message offset reset API; the closest
   * equivalent for in-flight messages is an immediate nak.
   *
   * Returns `true` when the pending message was found and nak-ed.
   */
  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const raw = this.pendingFor(queueName).get(id);
    if (!raw) {
      return false;
    }
    raw.nak();
    this.pendingFor(queueName).delete(id);
    return true;
  }

  /**
   * Return `true` when the given message ID is currently in the client-side
   * pending-ack map (fetched in this process but not yet acked).
   *
   * Note: this does not query the server.  Messages not yet fetched in the
   * current process will return `false` even if they exist in the stream.
   */
  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    return this.pendingFor(queueName).has(messageId);
  }

  /**
   * Return up to `count` message IDs from the client-side pending-ack map.
   *
   * These are messages already fetched but not yet acknowledged in the current
   * process.  Order reflects insertion order (Map iteration order).
   */
  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const pending = this.pendingFor(queueName);
    const ids: string[] = [];
    for (const id of pending.keys()) {
      if (ids.length >= count) {
        break;
      }
      ids.push(id);
    }
    return ids;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a server error indicates that a stream or consumer with
 * the requested name already exists.  This check covers multiple error message
 * formats that the NATS server may return across different versions.
 */
function isAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const msg = (err as { message?: string }).message ?? '';
  return (
    msg.includes('stream name already in use') ||
    msg.includes('already exists') ||
    msg.includes('consumer name already in use')
  );
}
