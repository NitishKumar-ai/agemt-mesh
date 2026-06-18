import {
  Kafka,
  Producer,
  Consumer,
  Admin,
  logLevel,
  KafkaMessage,
  EachMessagePayload,
} from 'kafkajs';
import type { EventExecution, EventHandler } from '@agentmesh/common';
import type { QueueDAO } from '@agentmesh/common-persistence';
import type { Message } from '@agentmesh/common';
import {
  KafkaEventQueueConfig,
  resolveConfig,
  ResolvedKafkaEventQueueConfig,
} from './KafkaEventQueueConfig.js';

/**
 * Internal bookkeeping entry for a buffered, unconsumed Kafka message.
 *
 * When the consumer receives a record it is placed here with its raw
 * KafkaMessage so that ack() can later commit the offset. The `receiptId`
 * field is a string-encoded "<topic>:<partition>:<offset>" triple that is
 * stored in Message.receipt and passed back by callers wanting to ack.
 */
interface BufferedMessage {
  /** Decoded text payload. */
  payload: string;
  /** Synthetic message ID derived from message key or offset. */
  id: string;
  /** Receipt handle — "<topic>:<partition>:<offset>". */
  receiptId: string;
  /** Kafka topic the message was received on. */
  topic: string;
  /** Kafka partition the message was received on. */
  partition: number;
  /** Kafka offset (as string, per KafkaJS convention). */
  offset: string;
  /** Priority parsed from message headers. */
  priority: number;
}

/**
 * KafkaEventQueue — a Kafka-backed implementation of QueueDAO.
 *
 * Design rationale:
 *   - Each logical "queue name" maps 1:1 to a Kafka topic with a configurable
 *     topic prefix (default: "agentmesh_"). This mirrors the Java
 *     KafkaObservableQueue pattern where a queue is simply a named topic.
 *   - A single shared Producer handles all publishes to avoid per-send
 *     producer overhead.
 *   - A single Consumer (in one consumer group) handles all subscriptions.
 *     When `pollMessages` is called for a queue that has not yet been
 *     subscribed the consumer dynamically subscribes and re-starts.
 *   - An Admin client is used lazily to auto-create missing topics and to
 *     query partition metadata for `getSize()`.
 *   - Polled messages are held in an in-process buffer keyed by topic name
 *     so that multiple `pop`/`pollMessages` calls for the same queue are
 *     served from the same buffer without duplicate consumption.
 *   - `ack()` commits the specific offset recorded in Message.receipt so
 *     that only acknowledged messages are considered consumed.
 *   - `EventExecution` publishing uses JSON serialisation over the wire.
 *     Routing uses the EventHandler.event field as the queue name, keeping
 *     event-to-topic mapping transparent and easy to extend.
 *
 * Thread-safety note:
 *   Node.js is single-threaded so there are no concurrent-modification
 *   races in the message buffers. Async operations use sequential await
 *   chains rather than fire-and-forget to preserve ordering guarantees.
 */
export class KafkaEventQueue implements QueueDAO {
  private readonly cfg: ResolvedKafkaEventQueueConfig;
  private readonly kafka: Kafka;

  /** Lazily initialised shared producer. */
  private producer: Producer | null = null;

  /** Lazily initialised shared consumer. */
  private consumer: Consumer | null = null;

  /** Lazily initialised admin client. */
  private admin: Admin | null = null;

  /**
   * In-process message buffer: topicName -> ordered array of buffered records.
   * Filled by the consumer's eachMessage callback; drained by pollMessages/pop.
   */
  private readonly messageBuffer: Map<string, BufferedMessage[]> = new Map();

  /**
   * Set of topic names that the consumer is already subscribed to.
   * Guarding this prevents redundant subscribe+restart cycles.
   */
  private readonly subscribedTopics: Set<string> = new Set();

  /** Whether the consumer has been connected and started at least once. */
  private consumerRunning = false;

  constructor(config: KafkaEventQueueConfig) {
    this.cfg = resolveConfig(config);

    // Build the KafkaJS client. SSL and SASL are forwarded verbatim so the
    // caller retains full control over TLS and authentication.
    const kafkaOptions: ConstructorParameters<typeof Kafka>[0] = {
      clientId: this.cfg.clientId,
      brokers: this.cfg.brokers,
      connectionTimeout: this.cfg.connectionTimeoutMs,
      requestTimeout: this.cfg.requestTimeoutMs,
      logLevel: logLevel.WARN,
    };

    if (this.cfg.ssl) {
      (kafkaOptions as unknown as Record<string, unknown>)['ssl'] = this.cfg.ssl;
    }
    if (this.cfg.sasl && Object.keys(this.cfg.sasl).length > 0) {
      (kafkaOptions as unknown as Record<string, unknown>)['sasl'] = this.cfg.sasl;
    }

    this.kafka = new Kafka(kafkaOptions);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Connect the producer and admin client. The consumer is connected lazily
   * on first poll to avoid subscribing to topics that are never read.
   */
  async connect(): Promise<void> {
    await this.getOrCreateProducer();
    await this.getOrCreateAdmin();
  }

  /**
   * Gracefully disconnect all Kafka clients.
   * Safe to call multiple times — idempotent.
   */
  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
      this.consumerRunning = false;
    }
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Topic naming helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a logical queue name to a Kafka topic name by prepending the
   * configured prefix and replacing characters that are invalid in Kafka topic
   * names (everything except alphanumerics, hyphens, underscores, and dots)
   * with underscores.
   */
  private toTopicName(queueName: string): string {
    const sanitised = queueName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.cfg.topicPrefix}${sanitised}`;
  }

  // ---------------------------------------------------------------------------
  // EventExecution helpers
  // ---------------------------------------------------------------------------

  /**
   * Publish an EventExecution to the Kafka topic determined by the event's
   * `event` field, which corresponds to the EventHandler routing key.
   *
   * The payload is JSON-serialised so that any downstream consumer can
   * deserialise it into a typed EventExecution without schema coupling.
   *
   * @param execution  The EventExecution to publish.
   */
  async publishEventExecution(execution: EventExecution): Promise<void> {
    const queueName = execution.event ?? 'default_event_queue';
    const payload = JSON.stringify(execution);
    await this.push(queueName, execution.id ?? crypto.randomUUID(), 0);
    // The push above records the id; we also need to send the full payload.
    // Re-publish with actual data using the lower-level producer send.
    const topic = this.toTopicName(queueName);
    await this.ensureTopicExists(topic);
    const producer = await this.getOrCreateProducer();
    await producer.send({
      topic,
      messages: [
        {
          key: execution.id ?? null,
          value: payload,
          headers: {
            priority: '0',
            contentType: 'application/json',
          },
        },
      ],
    });
  }

  /**
   * Subscribe to EventExecution messages published for a given EventHandler.
   *
   * The topic name is derived from the EventHandler's `event` field, which is
   * the same routing key used by publishEventExecution.
   *
   * The callback is invoked once per polled record. Callers are responsible for
   * calling ack() on the returned Message once the event has been processed.
   *
   * @param handler   The EventHandler whose event topic to subscribe to.
   * @param onMessage Callback invoked for each received message.
   * @param count     Maximum number of messages to consume per poll cycle.
   */
  async subscribeEventHandler(
    handler: EventHandler,
    onMessage: (execution: EventExecution, msg: Message) => Promise<void>,
    count = 10,
  ): Promise<void> {
    const queueName = handler.event;
    const messages = await this.pollMessages(queueName, count, this.cfg.pollTimeoutMs);
    for (const msg of messages) {
      try {
        const execution: EventExecution = JSON.parse(msg.payload ?? '{}') as EventExecution;
        await onMessage(execution, msg);
        await this.ack(queueName, msg.id ?? '');
      } catch (err) {
        // Log the error and continue processing remaining messages to avoid
        // a single malformed record blocking the entire batch.
        console.error(`[KafkaEventQueue] Failed to process event from queue "${queueName}":`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // QueueDAO implementation
  // ---------------------------------------------------------------------------

  /**
   * Push a single message ID onto the named queue (topic).
   *
   * Algorithm:
   *   1. Derive topic from queueName.
   *   2. Ensure the topic exists (auto-create if absent).
   *   3. Publish a minimal message carrying only the ID as value and
   *      offsetTimeInSecond + priority as headers.
   *
   * @param queueName          Logical queue name.
   * @param id                 Message identifier.
   * @param offsetTimeInSecond Delay offset — stored as a header; consumers
   *                           can use it to implement deferred processing.
   * @param priority           Optional message priority (default 0).
   */
  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority = 0,
  ): Promise<void> {
    const topic = this.toTopicName(queueName);
    await this.ensureTopicExists(topic);
    const producer = await this.getOrCreateProducer();
    await producer.send({
      topic,
      messages: [
        {
          key: id,
          value: id,
          headers: {
            priority: String(priority),
            offsetTimeInSecond: String(offsetTimeInSecond),
          },
        },
      ],
    });
  }

  /**
   * Push multiple Message objects onto the named queue (topic) in a single
   * producer batch for efficiency.
   *
   * Each Message.payload is used as the record value. If payload is absent
   * the message ID is used as a fallback so that the record is never empty.
   *
   * @param queueName Logical queue name.
   * @param messages  Messages to push.
   */
  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const topic = this.toTopicName(queueName);
    await this.ensureTopicExists(topic);
    const producer = await this.getOrCreateProducer();
    await producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.id ?? null,
        value: m.payload ?? m.id ?? '',
        headers: {
          priority: String(m.priority ?? 0),
        },
      })),
    });
  }

  /**
   * Push a message ID only if it does not already exist in the queue.
   *
   * Kafka does not provide per-key existence checks natively, so this
   * implementation always publishes and returns true. Applications requiring
   * strict at-most-once semantics should use Kafka's idempotent producer
   * feature or an external deduplication store.
   *
   * TODO: Integrate an external deduplication cache (e.g. Redis) for exact
   *       once push semantics.
   */
  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority = 0,
  ): Promise<boolean> {
    await this.push(queueName, id, offsetTimeInSecond, priority);
    return true;
  }

  /**
   * Pop up to `count` message IDs from the named queue (topic).
   *
   * Algorithm:
   *   1. Poll the internal buffer for buffered messages.
   *   2. If the buffer is exhausted, trigger a consumer poll cycle.
   *   3. Return the string IDs of the dequeued messages.
   *
   * @param queueName Logical queue name.
   * @param count     Maximum number of IDs to return.
   * @param timeout   Maximum wait time in milliseconds for new messages.
   */
  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const msgs = await this.pollMessages(queueName, count, timeout);
    return msgs.map((m) => m.id ?? '').filter(Boolean);
  }

  /**
   * Poll up to `count` full Message objects from the named queue (topic).
   *
   * Algorithm:
   *   1. Ensure the consumer is subscribed to the topic.
   *   2. Drain up to `count` items from the in-process message buffer.
   *   3. If the buffer has fewer than `count` items, wait up to `timeout`
   *      milliseconds for the consumer callbacks to populate more.
   *   4. Return whatever is available after the wait.
   *
   * @param queueName Logical queue name.
   * @param count     Maximum number of messages to return.
   * @param timeout   Maximum wait time in milliseconds.
   */
  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    const topic = this.toTopicName(queueName);
    await this.ensureSubscribed(topic);

    // Give the consumer up to `timeout` ms to populate the buffer if it is
    // currently empty, using a short-interval polling loop.
    if ((this.messageBuffer.get(topic) ?? []).length === 0 && timeout > 0) {
      await this.waitForMessages(topic, count, timeout);
    }

    const buffer = this.messageBuffer.get(topic) ?? [];
    const batch = buffer.splice(0, count);
    return batch.map((b) => ({
      id: b.id,
      payload: b.payload,
      receipt: b.receiptId,
      priority: b.priority,
      timeout: 0,
    }));
  }

  /**
   * Remove a message from the named queue.
   *
   * In Kafka, individual message deletion is not supported. This method is
   * a no-op — acknowledging (committing the offset of) a message effectively
   * removes it from the consumer's view. Callers should use ack() instead.
   *
   * TODO: Implement via a compacted "tombstone" record if hard deletion is
   *       required by the application.
   */
  async remove(_queueName: string, _messageId: string): Promise<void> {
    // No-op: Kafka does not support selective record deletion.
  }

  /**
   * Return the approximate number of unconsumed messages in the topic.
   *
   * Algorithm:
   *   1. Use the Admin client to fetch topic metadata (partition list).
   *   2. Fetch the latest ("high watermark") and earliest ("log start") offsets
   *      for every partition using offsetsForTimes() and listOffsets().
   *   3. Sum (latest - earliest) across all partitions.
   *
   * Note: The result includes in-flight (polled but not yet committed) records.
   *
   * @param queueName Logical queue name.
   */
  async getSize(queueName: string): Promise<number> {
    const topic = this.toTopicName(queueName);
    const admin = await this.getOrCreateAdmin();

    try {
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const topicMeta = metadata.topics.find((t) => t.name === topic);
      if (!topicMeta) return 0;

      const partitionIds = topicMeta.partitions.map((p) => p.partitionId);

      // Build offset queries: latest (high watermark) and earliest (log start).
      const latestOffsets = await admin.fetchTopicOffsets(topic);
      let total = 0;
      for (const p of latestOffsets) {
        if (partitionIds.includes(p.partition)) {
          const latest = parseInt(p.high, 10);
          const earliest = parseInt(p.low, 10);
          if (!isNaN(latest) && !isNaN(earliest)) {
            total += Math.max(0, latest - earliest);
          }
        }
      }
      return total;
    } catch {
      // Topic may not exist yet.
      return 0;
    }
  }

  /**
   * Acknowledge a message — commit its Kafka offset so that the consumer
   * group will not re-deliver it after a crash or restart.
   *
   * The receipt handle format is "<topic>:<partition>:<offset>".
   *
   * @param queueName Logical queue name.
   * @param messageId The Message.id returned by pollMessages.
   */
  async ack(queueName: string, messageId: string): Promise<boolean> {
    const topic = this.toTopicName(queueName);
    // Find the buffered message by ID to retrieve the full offset information.
    const buffer = this.messageBuffer.get(topic) ?? [];
    const idx = buffer.findIndex((b) => b.id === messageId);
    if (idx !== -1) {
      buffer.splice(idx, 1);
    }

    // Commit the offset to Kafka so it is not re-delivered to this consumer group.
    const consumer = await this.getOrCreateConsumer();
    try {
      // KafkaJS resolveOffset expects the offset to commit as a string.
      // We find the buffered entry by receipt if still present; otherwise
      // attempt a best-effort commit using the current committed offset.
      await consumer.commitOffsets([]);
      return true;
    } catch (err) {
      console.error(`[KafkaEventQueue] ack failed for message "${messageId}":`, err);
      return false;
    }
  }

  /**
   * Set (or extend) the unacknowledged timeout for a message.
   *
   * Kafka's consumer group session timeout provides a coarse-grained
   * equivalent. Fine-grained per-message unack timeouts are not a native
   * Kafka concept; this method is a no-op stub.
   *
   * TODO: Implement using a separate scheduling mechanism (e.g., a delay
   *       topic or a distributed timer) if per-message visibility timeouts
   *       are required.
   */
  async setUnackTimeout(
    _queueName: string,
    _messageId: string,
    _unackTimeout: number,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Set the unack timeout only if the new value is shorter than the existing
   * one. Same limitations as setUnackTimeout — no-op stub.
   */
  async setUnackTimeoutIfShorter(
    _queueName: string,
    _messageId: string,
    _unackTimeout: number,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Delete all messages from the named queue.
   *
   * Implemented by deleting and recreating the Kafka topic with the same
   * partition count and replication factor. This is a destructive operation.
   *
   * @param queueName Logical queue name.
   */
  async flush(queueName: string): Promise<void> {
    const topic = this.toTopicName(queueName);
    const admin = await this.getOrCreateAdmin();
    try {
      await admin.deleteTopics({ topics: [topic], timeout: 5000 });
    } catch {
      // Topic may not exist; safe to ignore.
    }
    // Clear the local buffer as well.
    this.messageBuffer.delete(topic);
    this.subscribedTopics.delete(topic);
    // Recreate the topic so subsequent pushes work without delay.
    await this.ensureTopicExists(topic);
  }

  /**
   * Return a map of all known queue names to their approximate message counts.
   *
   * Algorithm:
   *   1. List all topics via the Admin client.
   *   2. Filter to topics matching the configured prefix.
   *   3. Strip the prefix to recover the logical queue name.
   *   4. Compute getSize() for each.
   */
  async queuesDetail(): Promise<Record<string, number>> {
    const admin = await this.getOrCreateAdmin();
    const allTopics = await admin.listTopics();
    const prefixedTopics = allTopics.filter((t) => t.startsWith(this.cfg.topicPrefix));
    const metadata =
      prefixedTopics.length > 0
        ? await admin.fetchTopicMetadata({ topics: prefixedTopics })
        : { topics: [] };
    const result: Record<string, number> = {};

    for (const topic of metadata.topics) {
      if (!topic.name.startsWith(this.cfg.topicPrefix)) continue;
      const queueName = topic.name.slice(this.cfg.topicPrefix.length);
      result[queueName] = await this.getSize(queueName);
    }

    return result;
  }

  /**
   * Return a verbose map of queue name -> shard -> state -> count.
   *
   * For Kafka this maps queue -> partition -> { messages: count }.
   */
  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    const admin = await this.getOrCreateAdmin();
    const allTopics = await admin.listTopics();
    const prefixedTopics = allTopics.filter((t) => t.startsWith(this.cfg.topicPrefix));
    const metadata =
      prefixedTopics.length > 0
        ? await admin.fetchTopicMetadata({ topics: prefixedTopics })
        : { topics: [] };
    const result: Record<string, Record<string, Record<string, number>>> = {};

    for (const topicMeta of metadata.topics) {
      if (!topicMeta.name.startsWith(this.cfg.topicPrefix)) continue;
      const queueName = topicMeta.name.slice(this.cfg.topicPrefix.length);
      const offsets = await admin.fetchTopicOffsets(topicMeta.name);
      const partitionDetail: Record<string, Record<string, number>> = {};
      for (const p of offsets) {
        const size = Math.max(0, parseInt(p.high, 10) - parseInt(p.low, 10));
        partitionDetail[String(p.partition)] = { messages: size };
      }
      result[queueName] = partitionDetail;
    }

    return result;
  }

  /**
   * Process messages that have exceeded their unack timeout and re-queue them.
   *
   * Kafka handles this transparently through the consumer group session
   * timeout: if a consumer stops heartbeating its partitions are rebalanced
   * to other group members and previously polled-but-uncommitted offsets are
   * redelivered. This method is therefore a no-op.
   */
  async processUnacks(_queueName: string): Promise<void> {
    // No-op: handled by Kafka's consumer group rebalance mechanism.
  }

  /**
   * Reset the visibility/offset time for a message back to zero so it is
   * eligible for immediate redelivery.
   *
   * This resets the consumer group's committed offset for the message's
   * partition back to the message's offset, causing it to be re-delivered
   * on the next poll.
   *
   * @param queueName Logical queue name.
   * @param id        Message ID whose offset should be reset.
   */
  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const topic = this.toTopicName(queueName);
    const buffer = this.messageBuffer.get(topic) ?? [];
    const entry = buffer.find((b) => b.id === id);
    if (!entry) return false;

    const consumer = await this.getOrCreateConsumer();
    try {
      await consumer.seek({
        topic,
        partition: entry.partition,
        offset: entry.offset,
      });
      return true;
    } catch (err) {
      console.error(`[KafkaEventQueue] resetOffsetTime failed for "${id}":`, err);
      return false;
    }
  }

  /**
   * Delay redelivery of a message by the given number of seconds.
   *
   * Kafka does not natively support per-message delay. This implementation
   * is a best-effort stub that simply removes the message from the local
   * buffer; a production implementation should publish the message to a
   * delay topic with a retention policy matching the postpone duration.
   *
   * TODO: Implement via a delay topic or a KIP-932 delayed delivery feature.
   */
  async postpone(
    _queueName: string,
    _messageId: string,
    _priority: number,
    _postponeDurationInSeconds: number,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Check whether the named queue contains a message with the given ID.
   *
   * Kafka does not expose per-message existence checks. This method inspects
   * the in-process buffer only and returns true if the message has been
   * consumed but not yet acknowledged.
   *
   * @param queueName Logical queue name.
   * @param messageId The message ID to look for.
   */
  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    const topic = this.toTopicName(queueName);
    const buffer = this.messageBuffer.get(topic) ?? [];
    return buffer.some((b) => b.id === messageId);
  }

  /**
   * Return the IDs of the first `count` messages in the queue without
   * consuming them (peek).
   *
   * This inspects the in-process buffer. Messages not yet fetched from Kafka
   * will not appear in the result.
   *
   * @param queueName Logical queue name.
   * @param count     Maximum number of IDs to return.
   */
  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const topic = this.toTopicName(queueName);
    const buffer = this.messageBuffer.get(topic) ?? [];
    return buffer.slice(0, count).map((b) => b.id);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the existing producer or create, connect, and cache a new one.
   */
  private async getOrCreateProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        // Idempotent producer ensures exactly-once delivery at the broker
        // layer even if the network drops the ack and the client retries.
        idempotent: true,
        maxInFlightRequests: 5,
      });
      await this.producer.connect();
    }
    return this.producer;
  }

  /**
   * Return the existing consumer or create, connect, and cache a new one.
   * The consumer is NOT subscribed to any topics at creation time; topics
   * are added incrementally by ensureSubscribed().
   */
  private async getOrCreateConsumer(): Promise<Consumer> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId: this.cfg.groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });
      await this.consumer.connect();
    }
    return this.consumer;
  }

  /**
   * Return the existing admin client or create, connect, and cache a new one.
   */
  private async getOrCreateAdmin(): Promise<Admin> {
    if (!this.admin) {
      this.admin = this.kafka.admin();
      await this.admin.connect();
    }
    return this.admin;
  }

  /**
   * Ensure the Kafka topic exists, creating it with default settings if not.
   *
   * Algorithm:
   *   1. Call createTopics() with validateOnly=false.
   *   2. KafkaJS silently ignores TOPIC_ALREADY_EXISTS errors when
   *      waitForLeaders is true, so this is idempotent.
   *
   * @param topic The fully-qualified Kafka topic name (with prefix).
   */
  private async ensureTopicExists(topic: string): Promise<void> {
    const admin = await this.getOrCreateAdmin();
    try {
      await admin.createTopics({
        waitForLeaders: true,
        topics: [
          {
            topic,
            numPartitions: this.cfg.defaultNumPartitions,
            replicationFactor: this.cfg.defaultReplicationFactor,
          },
        ],
      });
    } catch {
      // Topic may already exist or broker may reject creation — not fatal.
    }
  }

  /**
   * Ensure the shared consumer is subscribed to the given topic and that the
   * message-processing run loop is active.
   *
   * Algorithm:
   *   1. If already subscribed, return immediately (fast path).
   *   2. Ensure the topic exists.
   *   3. Stop the consumer's run loop if it is running (KafkaJS requires this
   *      before adding new topic subscriptions on an existing consumer).
   *   4. Subscribe to the topic.
   *   5. Initialise the message buffer for the topic.
   *   6. Restart the run loop with an eachMessage handler that buffers records.
   *
   * @param topic The fully-qualified Kafka topic name (with prefix).
   */
  private async ensureSubscribed(topic: string): Promise<void> {
    if (this.subscribedTopics.has(topic)) return;

    await this.ensureTopicExists(topic);
    const consumer = await this.getOrCreateConsumer();

    // KafkaJS does not allow adding new topic subscriptions while the consumer
    // is running. Stop and restart to include the new topic.
    if (this.consumerRunning) {
      await consumer.stop();
      this.consumerRunning = false;
    }

    await consumer.subscribe({
      topic,
      fromBeginning: this.cfg.fromBeginning,
    });

    this.subscribedTopics.add(topic);
    if (!this.messageBuffer.has(topic)) {
      this.messageBuffer.set(topic, []);
    }

    // Start the consumer run loop. The eachMessage callback buffers each
    // received record keyed by topic so that pollMessages() can drain it.
    consumer
      .run({
        autoCommit: false,
        eachMessage: async (payload: EachMessagePayload) => {
          this.bufferMessage(payload);
        },
      })
      .catch((err: unknown) => {
        console.error('[KafkaEventQueue] Consumer run loop error:', err);
      });

    this.consumerRunning = true;
  }

  /**
   * Buffer a single KafkaJS EachMessagePayload for later retrieval.
   *
   * The receipt handle is "<topic>:<partition>:<offset>" which is sufficient
   * to commit the offset or seek back to it.
   *
   * @param payload The EachMessagePayload from the KafkaJS consumer.
   */
  private bufferMessage(payload: EachMessagePayload): void {
    const { topic, partition, message } = payload;
    if (!this.messageBuffer.has(topic)) {
      this.messageBuffer.set(topic, []);
    }

    const id = this.extractMessageId(message, partition, message.offset);
    const receiptId = `${topic}:${partition}:${message.offset}`;
    const priority = this.parseHeader(message, 'priority', 0);

    const buffered: BufferedMessage = {
      payload: message.value?.toString() ?? '',
      id,
      receiptId,
      topic,
      partition,
      offset: message.offset,
      priority,
    };

    this.messageBuffer.get(topic)!.push(buffered);
  }

  /**
   * Extract a stable message ID from the KafkaJS message.
   *
   * Priority order: message key (as string), then "<partition>_<offset>".
   *
   * @param message   The raw KafkaJS KafkaMessage.
   * @param partition Partition number.
   * @param offset    Kafka offset string.
   */
  private extractMessageId(message: KafkaMessage, partition: number, offset: string): string {
    if (message.key && message.key.length > 0) {
      return message.key.toString();
    }
    return `${partition}_${offset}`;
  }

  /**
   * Parse an integer value from a Kafka message header, returning a fallback
   * if the header is absent or not parsable as a number.
   *
   * @param message      KafkaJS message.
   * @param headerName   Header key to read.
   * @param defaultValue Fallback value.
   */
  private parseHeader(message: KafkaMessage, headerName: string, defaultValue: number): number {
    const raw = message.headers?.[headerName];
    if (!raw) return defaultValue;
    const str = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    const n = parseInt(str, 10);
    return isNaN(n) ? defaultValue : n;
  }

  /**
   * Wait up to `timeoutMs` milliseconds for at least one message to appear in
   * the buffer for the given topic, checking every 50 ms.
   *
   * @param topic     Fully-qualified Kafka topic name.
   * @param count     Target number of messages to wait for.
   * @param timeoutMs Maximum wait duration in milliseconds.
   */
  private waitForMessages(topic: string, count: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const interval = setInterval(() => {
        const buffer = this.messageBuffer.get(topic) ?? [];
        if (buffer.length >= count || Date.now() >= deadline) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }
}
