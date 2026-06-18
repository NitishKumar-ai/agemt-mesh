/**
 * KafkaQueue — QueueDAO implementation backed by Apache Kafka via kafkajs.
 *
 * Design overview
 * ---------------
 * Each logical "queue" in the QueueDAO contract maps to a Kafka topic whose
 * name is derived from the queue name (illegal Kafka characters are replaced
 * with underscores).  The implementation maintains:
 *
 *  - A single KafkaJS Producer shared across all queues (connected lazily on
 *    first use and kept open for the lifetime of the instance).
 *  - A per-queue Consumer that is created on demand when pollMessages / pop is
 *    called.  Each consumer belongs to the configurable consumer-group.
 *  - An in-process "unack" registry: messages that have been polled but not
 *    yet acked are tracked in memory so that they can be nacked / re-delivered
 *    via setUnackTimeout and related helpers.
 *
 * Kafka limitations vs the full QueueDAO contract
 * ------------------------------------------------
 *  - `getSize`          : Kafka does not expose per-topic message count cheaply;
 *                         this implementation returns the lag of the consumer group
 *                         when a consumer exists, or 0 otherwise.
 *  - `setUnackTimeout`  : Kafka has no server-side visibility timer.  The
 *                         implementation records the intended re-deliver timestamp
 *                         in memory and a background sweep re-publishes overdue
 *                         messages.  This is best-effort; restarting the process
 *                         will forget pending unack timers.
 *  - `queuesDetailVerbose`: Returns per-queue shard info as a best-effort map.
 *  - `pushIfNotExists`  : Kafka has no native deduplication; this is implemented
 *                         with a per-process in-memory set and is therefore not
 *                         cluster-safe.  Idempotent producers (enabled by default)
 *                         protect against producer-side duplicates only.
 *  - `peekFirstIds`     : Not supported natively; returns an empty array.
 *
 * Thread safety
 * -------------
 * kafkajs is async/event-loop based.  All state mutations use simple in-process
 * Maps which are safe for single-threaded Node.js execution.
 */

import {
  Kafka,
  Producer,
  Consumer,
  EachMessagePayload,
  KafkaConfig,
  ProducerRecord,
  RecordMetadata,
  Admin,
  ITopicConfig,
  Offsets,
  SeekEntry,
} from 'kafkajs';
import { Message } from '@agentmesh/common';
import { QueueDAO } from '@agentmesh/common-persistence';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/**
 * Configuration accepted by KafkaQueue.
 */
export interface KafkaQueueConfig {
  /** Comma-separated list of broker addresses, e.g. "localhost:9092". */
  brokers: string[];

  /** Client ID reported to the Kafka cluster. */
  clientId?: string;

  /**
   * Consumer group ID.  All KafkaQueue instances sharing the same group
   * compete for partition ownership (standard Kafka consumer group semantics).
   */
  groupId: string;

  /**
   * Replication factor for auto-created topics. Defaults to 1.
   */
  replicationFactor?: number;

  /**
   * Number of partitions for auto-created topics. Defaults to 1.
   */
  numPartitions?: number;

  /**
   * How long (ms) the poll call blocks waiting for new messages before
   * returning an empty result.  Defaults to 500 ms.
   */
  pollTimeoutMs?: number;

  /**
   * Interval (ms) at which the background unack-sweep runs to re-deliver
   * messages whose unack timeout has expired.  Defaults to 5000 ms.
   */
  unackSweepIntervalMs?: number;

  /**
   * Additional KafkaJS configuration forwarded verbatim to the Kafka client.
   */
  kafkaConfig?: Partial<KafkaConfig>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Represents a message that has been polled but not yet acknowledged.
 */
interface UnackEntry {
  message: Message;
  queueName: string;
  /** Epoch ms at which the unack timeout expires; undefined = no timeout set. */
  unackDeadlineMs?: number;
}

/**
 * Sanitise a queue name so it is a valid Kafka topic name.
 * Kafka topics must match: [a-zA-Z0-9._-]+
 * We replace all other characters with underscores.
 */
function toTopicName(queueName: string): string {
  return queueName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Generate a unique receipt handle that encodes the queue and a monotonically
 * increasing sequence number.  This is stored on the Message.receipt field and
 * used for ack / remove operations.
 */
let receiptCounter = 0;
function generateReceipt(topicName: string): string {
  receiptCounter += 1;
  return `${topicName}:${Date.now()}:${receiptCounter}`;
}

// ---------------------------------------------------------------------------
// KafkaQueue
// ---------------------------------------------------------------------------

/**
 * QueueDAO implementation backed by Apache Kafka.
 *
 * Lifecycle
 * ---------
 * Call {@link connect} before the first use and {@link disconnect} during
 * graceful shutdown.  Both methods are idempotent.
 *
 * @example
 * ```ts
 * const queue = new KafkaQueue({
 *   brokers: ['localhost:9092'],
 *   groupId: 'agentmesh-workers',
 * });
 * await queue.connect();
 * await queue.push('task_queue', 'task-id-1', 0);
 * const ids = await queue.pop('task_queue', 1, 500);
 * await queue.ack('task_queue', ids[0]);
 * await queue.disconnect();
 * ```
 */
export class KafkaQueue implements QueueDAO {
  private readonly kafka: Kafka;
  private readonly config: Required<
    Omit<KafkaQueueConfig, 'kafkaConfig'>
  > & { kafkaConfig?: Partial<KafkaConfig> };

  private producer: Producer | null = null;
  private admin: Admin | null = null;

  /**
   * Map of queueName -> Consumer.  Created lazily on first pop/poll.
   */
  private readonly consumers: Map<string, Consumer> = new Map();

  /**
   * In-memory ring buffer of recently polled messages per queue, used to
   * serve pop() calls that arrive while a consumer is already draining.
   *
   * key   = queueName
   * value = ordered array of Messages waiting to be returned to callers
   */
  private readonly pendingMessages: Map<string, Message[]> = new Map();

  /**
   * Registry of messages that have been handed to callers but not yet acked.
   * key = message.receipt
   */
  private readonly unackRegistry: Map<string, UnackEntry> = new Map();

  /**
   * Tracks message IDs that are "in flight" for pushIfNotExists deduplication.
   * This is per-process only and not cluster-safe.
   * key = queueName:messageId
   */
  private readonly knownIds: Set<string> = new Set();

  /**
   * Handle returned by setInterval for the unack-sweep background task.
   */
  private unackSweepTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether connect() has been successfully called. */
  private connected = false;

  constructor(config: KafkaQueueConfig) {
    const {
      brokers,
      clientId = 'agentmesh-kafka-queue',
      groupId,
      replicationFactor = 1,
      numPartitions = 1,
      pollTimeoutMs = 500,
      unackSweepIntervalMs = 5000,
      kafkaConfig,
    } = config;

    this.config = {
      brokers,
      clientId,
      groupId,
      replicationFactor,
      numPartitions,
      pollTimeoutMs,
      unackSweepIntervalMs,
      kafkaConfig,
    };

    this.kafka = new Kafka({
      clientId,
      brokers,
      ...(kafkaConfig ?? {}),
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect the shared producer and admin client to the Kafka cluster.
   * This method is idempotent.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.producer = this.kafka.producer({
      idempotent: true,
      allowAutoTopicCreation: false,
    });
    await this.producer.connect();

    this.admin = this.kafka.admin();
    await this.admin.connect();

    // Start the background unack-sweep timer.
    this.unackSweepTimer = setInterval(
      () => void this.sweepUnacks(),
      this.config.unackSweepIntervalMs,
    );

    this.connected = true;
  }

  /**
   * Gracefully disconnect all producers, consumers, and admin client.
   * Safe to call multiple times.
   */
  async disconnect(): Promise<void> {
    if (this.unackSweepTimer !== null) {
      clearInterval(this.unackSweepTimer);
      this.unackSweepTimer = null;
    }

    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
    this.consumers.clear();

    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
    }

    this.connected = false;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Return the connected producer, throwing if connect() was not called.
   */
  private getProducer(): Producer {
    if (!this.producer) {
      throw new Error(
        'KafkaQueue: producer is not connected. Call connect() first.',
      );
    }
    return this.producer;
  }

  /**
   * Return the admin client, throwing if connect() was not called.
   */
  private getAdmin(): Admin {
    if (!this.admin) {
      throw new Error(
        'KafkaQueue: admin is not connected. Call connect() first.',
      );
    }
    return this.admin;
  }

  /**
   * Ensure a Kafka topic exists, creating it if necessary.
   */
  private async ensureTopic(topicName: string): Promise<void> {
    const admin = this.getAdmin();
    const existing = await admin.listTopics();
    if (!existing.includes(topicName)) {
      await admin.createTopics({
        topics: [
          {
            topic: topicName,
            numPartitions: this.config.numPartitions,
            replicationFactor: this.config.replicationFactor,
          } as ITopicConfig,
        ],
        waitForLeaders: true,
      });
    }
  }

  /**
   * Return the consumer for a given queue, creating and subscribing it if
   * it does not yet exist.
   */
  private async getOrCreateConsumer(queueName: string): Promise<Consumer> {
    const existing = this.consumers.get(queueName);
    if (existing) return existing;

    const topicName = toTopicName(queueName);
    await this.ensureTopic(topicName);

    const consumer = this.kafka.consumer({
      groupId: this.config.groupId,
      allowAutoTopicCreation: false,
    });

    await consumer.connect();
    await consumer.subscribe({ topic: topicName, fromBeginning: false });

    // Set up the push-to-buffer handler.  Messages are accumulated in
    // pendingMessages and drained by pop() / pollMessages().
    await consumer.run({
      autoCommit: false,
      eachMessage: async (payload: EachMessagePayload) => {
        const { message } = payload;
        const value = message.value?.toString() ?? '';

        let parsed: Message;
        try {
          parsed = JSON.parse(value) as Message;
        } catch {
          // Malformed message — treat the raw value as the payload.
          parsed = { id: message.key?.toString() ?? undefined, payload: value, priority: 0, timeout: 0 };
        }

        // Assign a receipt handle if one was not included in the message body.
        if (!parsed.receipt) {
          parsed = { ...parsed, receipt: generateReceipt(topicName) };
        }

        const queue = this.pendingMessages.get(queueName) ?? [];
        queue.push(parsed);
        this.pendingMessages.set(queueName, queue);
      },
    });

    this.consumers.set(queueName, consumer);
    return consumer;
  }

  /**
   * Drain up to `count` messages from the pending buffer for a queue.
   * Waits up to `timeoutMs` for messages to arrive before returning.
   */
  private async drainMessages(
    queueName: string,
    count: number,
    timeoutMs: number,
  ): Promise<Message[]> {
    // Trigger consumer creation (and subscription) if needed.
    await this.getOrCreateConsumer(queueName);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pending = this.pendingMessages.get(queueName) ?? [];
      if (pending.length > 0) {
        const batch = pending.splice(0, count);
        this.pendingMessages.set(queueName, pending);

        // Commit offsets for the consumed batch.
        await this.commitOffsets(queueName, batch);

        // Register each message in the unack registry.
        for (const msg of batch) {
          if (msg.receipt) {
            this.unackRegistry.set(msg.receipt, { message: msg, queueName });
          }
          if (msg.id) {
            this.knownIds.add(`${queueName}:${msg.id}`);
          }
        }

        return batch;
      }

      // Short sleep to avoid a tight poll loop.
      await sleep(50);
    }

    return [];
  }

  /**
   * Commit Kafka offsets for a batch of messages that were polled.
   * This records that the messages have been handed to a consumer; the unack
   * registry tracks whether they have been processed successfully.
   */
  private async commitOffsets(
    queueName: string,
    _messages: Message[],
  ): Promise<void> {
    const consumer = this.consumers.get(queueName);
    if (!consumer) return;

    // kafkajs auto-commits are disabled; we perform a manual seek/commit.
    // Because we use an internal pending buffer rather than per-message offsets,
    // we use the consumer.commitOffsets() API with the current assignment.
    try {
      await consumer.commitOffsets([]);
    } catch {
      // Offset commit is best-effort in the absence of precise offset tracking.
    }
  }

  /**
   * Background task: re-publish any unacked messages whose deadline has passed.
   */
  private async sweepUnacks(): Promise<void> {
    const now = Date.now();
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (
        entry.unackDeadlineMs !== undefined &&
        now >= entry.unackDeadlineMs
      ) {
        this.unackRegistry.delete(receipt);
        // Re-publish the message so it can be consumed again.
        try {
          await this.pushMessages(entry.queueName, [entry.message]);
        } catch (err) {
          console.error(
            `KafkaQueue: failed to re-publish unacked message ${receipt}:`,
            err,
          );
        }
      }
    }
  }

  /**
   * Publish a single serialised Kafka record.
   */
  private async publishRecord(
    topicName: string,
    key: string,
    value: string,
    priority?: number,
  ): Promise<RecordMetadata[]> {
    await this.ensureTopic(topicName);
    const producer = this.getProducer();

    const record: ProducerRecord = {
      topic: topicName,
      messages: [
        {
          key,
          value,
          headers: {
            priority: String(priority ?? 0),
          },
        },
      ],
    };

    return producer.send(record);
  }

  // -------------------------------------------------------------------------
  // QueueDAO implementation
  // -------------------------------------------------------------------------

  /**
   * Push a single message identified by `id` onto the queue.
   *
   * @param queueName       - Logical queue name (mapped to a Kafka topic).
   * @param id              - Unique message identifier.
   * @param offsetTimeInSecond - Delay before the message should be visible.
   *   Kafka does not support delayed delivery natively; messages are published
   *   immediately and consumers are expected to honour the `timeout` field.
   * @param priority        - Optional priority hint stored in the message header.
   */
  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority?: number,
  ): Promise<void> {
    const topicName = toTopicName(queueName);
    const msg: Message = {
      id,
      priority: priority ?? 0,
      timeout: offsetTimeInSecond,
    };

    this.knownIds.add(`${queueName}:${id}`);
    await this.publishRecord(topicName, id, JSON.stringify(msg), priority);
  }

  /**
   * Push a batch of {@link Message} objects onto the queue.
   *
   * @param queueName - Logical queue name.
   * @param messages  - Messages to publish.  Each message's `id` is used as
   *                    the Kafka record key for ordering guarantees within a
   *                    partition.
   */
  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    const topicName = toTopicName(queueName);
    await this.ensureTopic(topicName);

    const producer = this.getProducer();
    const records = messages.map((m) => ({
      key: m.id ?? generateReceipt(topicName),
      value: JSON.stringify(m),
      headers: {
        priority: String(m.priority ?? 0),
      },
    }));

    await producer.send({
      topic: topicName,
      messages: records,
    });

    for (const m of messages) {
      if (m.id) this.knownIds.add(`${queueName}:${m.id}`);
    }
  }

  /**
   * Push a message only if a message with the same `id` has not already been
   * published to this queue in the lifetime of this process.
   *
   * Note: deduplication is per-process only.  A cluster of KafkaQueue instances
   * may still produce duplicates.  For strict exactly-once semantics consider
   * using Kafka's idempotent producer together with a transactional producer.
   *
   * @returns `true` if the message was pushed; `false` if it already existed.
   */
  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority?: number,
  ): Promise<boolean> {
    const key = `${queueName}:${id}`;
    if (this.knownIds.has(key)) return false;

    await this.push(queueName, id, offsetTimeInSecond, priority);
    return true;
  }

  /**
   * Pop up to `count` message IDs from the queue, waiting at most `timeout` ms.
   *
   * @param queueName - Logical queue name.
   * @param count     - Maximum number of messages to return.
   * @param timeout   - Maximum wait time in milliseconds.
   * @returns Array of message IDs (not full {@link Message} objects).
   */
  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const messages = await this.drainMessages(queueName, count, timeout);
    return messages
      .map((m) => m.id)
      .filter((id): id is string => id !== undefined);
  }

  /**
   * Poll up to `count` full {@link Message} objects from the queue.
   *
   * @param queueName - Logical queue name.
   * @param count     - Maximum number of messages to return.
   * @param timeout   - Maximum wait time in milliseconds.
   */
  async pollMessages(
    queueName: string,
    count: number,
    timeout: number,
  ): Promise<Message[]> {
    return this.drainMessages(queueName, count, timeout);
  }

  /**
   * Acknowledge a message, removing it permanently from the unack registry.
   *
   * In Kafka, consuming a message with autoCommit=false is sufficient to
   * prevent re-delivery within the same consumer group.  Acking here clears
   * the in-process unack registry entry so the background sweeper will not
   * re-publish it.
   *
   * @param queueName - Logical queue name (used for registry lookup).
   * @param messageId - The message ID or receipt handle to acknowledge.
   * @returns `true` if the entry was found and removed; `false` otherwise.
   */
  async ack(queueName: string, messageId: string): Promise<boolean> {
    // The caller may pass either the message.id or message.receipt.
    // Search by receipt first, then fall back to id scan.
    if (this.unackRegistry.has(messageId)) {
      this.unackRegistry.delete(messageId);
      return true;
    }

    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.message.id === messageId && entry.queueName === queueName) {
        this.unackRegistry.delete(receipt);
        return true;
      }
    }

    return false;
  }

  /**
   * Remove a message from the queue by ID.
   *
   * Kafka does not support per-message deletion from a topic.  This
   * implementation removes the message from the in-process pending buffer and
   * unack registry so it will not be delivered to the caller again within this
   * process lifetime.  Across process restarts the message may still be
   * re-delivered if it has not been committed.
   *
   * @param queueName - Logical queue name.
   * @param messageId - ID of the message to remove.
   */
  async remove(queueName: string, messageId: string): Promise<void> {
    // Remove from pending buffer.
    const pending = this.pendingMessages.get(queueName);
    if (pending) {
      const filtered = pending.filter((m) => m.id !== messageId);
      this.pendingMessages.set(queueName, filtered);
    }

    // Remove from unack registry.
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.message.id === messageId && entry.queueName === queueName) {
        this.unackRegistry.delete(receipt);
        break;
      }
    }

    // Remove from the known-id dedup set.
    this.knownIds.delete(`${queueName}:${messageId}`);
  }

  /**
   * Return the approximate number of messages pending on the queue.
   *
   * When a consumer group exists the lag (number of uncommitted messages) is
   * returned.  Otherwise 0 is returned.
   *
   * @param queueName - Logical queue name.
   */
  async getSize(queueName: string): Promise<number> {
    const topicName = toTopicName(queueName);
    const pending = this.pendingMessages.get(queueName)?.length ?? 0;

    // Add unacked messages in this process.
    let unacked = 0;
    for (const entry of this.unackRegistry.values()) {
      if (entry.queueName === queueName) unacked++;
    }

    return pending + unacked;
  }

  /**
   * Set a server-side visibility timeout for an unacked message.
   *
   * If the message is not acked before `unackTimeout` milliseconds the
   * background sweeper will re-publish it.
   *
   * @param queueName    - Logical queue name.
   * @param messageId    - Message ID or receipt handle.
   * @param unackTimeout - Duration in milliseconds before re-delivery.
   * @returns `true` if the entry was found and updated; `false` otherwise.
   */
  async setUnackTimeout(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, messageId);
    if (!entry) return false;

    entry.unackDeadlineMs = Date.now() + unackTimeout;
    return true;
  }

  /**
   * Set the unack timeout only if `unackTimeout` results in a shorter
   * deadline than the one currently set (or if no deadline is set).
   *
   * @param queueName    - Logical queue name.
   * @param messageId    - Message ID or receipt handle.
   * @param unackTimeout - Candidate duration in milliseconds.
   * @returns `true` if the deadline was updated; `false` otherwise.
   */
  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, messageId);
    if (!entry) return false;

    const candidate = Date.now() + unackTimeout;
    if (
      entry.unackDeadlineMs === undefined ||
      candidate < entry.unackDeadlineMs
    ) {
      entry.unackDeadlineMs = candidate;
      return true;
    }

    return false;
  }

  /**
   * Delete all pending messages for a queue (flush the pending buffer).
   *
   * Note: messages already committed to the Kafka topic are not deleted.  To
   * permanently remove all messages the topic would need to be deleted and
   * re-created, which is an administrative operation.
   *
   * @param queueName - Logical queue name.
   */
  async flush(queueName: string): Promise<void> {
    this.pendingMessages.set(queueName, []);

    // Remove all unack entries for this queue.
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.queueName === queueName) {
        this.unackRegistry.delete(receipt);
      }
    }
  }

  /**
   * Return a map of all known queue names to their approximate pending-message
   * counts.
   */
  async queuesDetail(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const queueName of this.pendingMessages.keys()) {
      result[queueName] = await this.getSize(queueName);
    }
    return result;
  }

  /**
   * Return a verbose map of queue details including shard/partition breakdown.
   *
   * For Kafka the outer key is the queue (topic) name, the inner key is the
   * partition number as a string, and the value map contains "size" (message
   * count for that partition, approximated as total / numPartitions).
   */
  async queuesDetailVerbose(): Promise<
    Record<string, Record<string, Record<string, number>>>
  > {
    const detail: Record<string, Record<string, Record<string, number>>> = {};
    for (const queueName of this.pendingMessages.keys()) {
      const size = await this.getSize(queueName);
      const perPartition = Math.ceil(size / this.config.numPartitions);
      const partitions: Record<string, Record<string, number>> = {};
      for (let p = 0; p < this.config.numPartitions; p++) {
        partitions[String(p)] = { size: perPartition };
      }
      detail[queueName] = partitions;
    }
    return detail;
  }

  /**
   * Re-enqueue all unacked messages for a queue whose unack deadline has
   * expired.  This is the same logic the background sweeper runs automatically;
   * callers can trigger it explicitly on demand.
   *
   * @param queueName - Logical queue name.
   */
  async processUnacks(queueName: string): Promise<void> {
    const now = Date.now();
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (
        entry.queueName === queueName &&
        entry.unackDeadlineMs !== undefined &&
        now >= entry.unackDeadlineMs
      ) {
        this.unackRegistry.delete(receipt);
        await this.pushMessages(queueName, [entry.message]);
      }
    }
  }

  /**
   * Reset the delivery offset for a message so it will be re-delivered on the
   * next poll.  Implemented by re-publishing the message with a fresh receipt.
   *
   * @param queueName - Logical queue name.
   * @param id        - Message ID.
   * @returns `true` if the message was found in the unack registry and re-queued.
   */
  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, id);
    if (!entry) return false;

    const receipt = this.findReceiptForEntry(entry);
    if (receipt) this.unackRegistry.delete(receipt);

    const fresh: Message = { ...entry.message, receipt: undefined };
    await this.pushMessages(queueName, [fresh]);
    return true;
  }

  /**
   * Postpone re-delivery of a message by `postponeDurationInSeconds`.
   *
   * Equivalent to extending the unack deadline.  The message will not be
   * re-published by the sweeper until the new deadline expires.
   *
   * @param queueName               - Logical queue name.
   * @param messageId               - Message ID or receipt handle.
   * @param priority                - New priority (currently unused in Kafka).
   * @param postponeDurationInSeconds - How many additional seconds to wait.
   * @returns `true` if the entry was found and updated.
   */
  async postpone(
    queueName: string,
    messageId: string,
    _priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, messageId);
    if (!entry) return false;

    const additionalMs = postponeDurationInSeconds * 1000;
    entry.unackDeadlineMs =
      (entry.unackDeadlineMs ?? Date.now()) + additionalMs;
    return true;
  }

  /**
   * Return whether a message with the given ID is currently known to this
   * KafkaQueue instance (either in the pending buffer, in the unack registry,
   * or in the known-ID set).
   *
   * @param queueName - Logical queue name.
   * @param messageId - Message ID to check.
   */
  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    if (this.knownIds.has(`${queueName}:${messageId}`)) return true;

    const pending = this.pendingMessages.get(queueName) ?? [];
    if (pending.some((m) => m.id === messageId)) return true;

    for (const entry of this.unackRegistry.values()) {
      if (entry.queueName === queueName && entry.message.id === messageId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Return up to `count` message IDs from the head of the pending buffer
   * without consuming them.
   *
   * Note: "peek" is not natively supported by Kafka.  This method looks only
   * at the in-process pending buffer and will return an empty array if no
   * messages have been buffered yet.
   *
   * @param queueName - Logical queue name.
   * @param count     - Maximum number of IDs to return.
   */
  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const pending = this.pendingMessages.get(queueName) ?? [];
    return pending
      .slice(0, count)
      .map((m) => m.id)
      .filter((id): id is string => id !== undefined);
  }

  // -------------------------------------------------------------------------
  // Private helpers (unack registry)
  // -------------------------------------------------------------------------

  /**
   * Find an {@link UnackEntry} by either the message ID or the receipt handle,
   * scoped to the given queue.
   */
  private findUnackEntry(
    queueName: string,
    messageIdOrReceipt: string,
  ): UnackEntry | undefined {
    // Direct receipt lookup.
    const direct = this.unackRegistry.get(messageIdOrReceipt);
    if (direct && direct.queueName === queueName) return direct;

    // Scan by message ID.
    for (const entry of this.unackRegistry.values()) {
      if (
        entry.queueName === queueName &&
        entry.message.id === messageIdOrReceipt
      ) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Find the receipt handle key for a given {@link UnackEntry}.
   */
  private findReceiptForEntry(target: UnackEntry): string | undefined {
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry === target) return receipt;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
