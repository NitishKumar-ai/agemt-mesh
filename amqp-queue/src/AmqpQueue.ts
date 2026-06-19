import { connect, Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { Message } from '@agentmesh/common';
import { QueueDAO } from '@agentmesh/common-persistence';

export interface AmqpQueueConfig {
  url: string;
  queuePrefix?: string;
  pollTimeoutMs?: number;
  unackSweepIntervalMs?: number;
  prefetchCount?: number;
}

interface UnackEntry {
  message: Message;
  queueName: string;
  channel: Channel;
  deliveryTag: number;
  unackDeadlineMs?: number;
}

interface QueueConsumer {
  channel: Channel;
  queueName: string;
  consumerTag: string;
}

let receiptCounter = 0;

function generateReceipt(queueName: string): string {
  receiptCounter += 1;
  return `${queueName}:${Date.now()}:${receiptCounter}`;
}

/**
 * AmqpQueue — pure AMQP (RabbitMQ) implementation of QueueDAO.
 *
 * Each logical queue maps to a durable AMQP queue. A single connection
 * is shared; per-queue consumer channels are created on demand.
 * Messages are buffered in-process and an unack registry with background
 * sweeper handles re-delivery timing.
 *
 * Call {@link connect} before first use and {@link disconnect} during
 * graceful shutdown.
 */
export class AmqpQueue implements QueueDAO {
  private readonly config: Required<AmqpQueueConfig>;
  private connection: ChannelModel | null = null;
  private publishChannel: Channel | null = null;
  private readonly consumers = new Map<string, QueueConsumer>();
  private readonly pendingMessages = new Map<string, Message[]>();
  private readonly unackRegistry = new Map<string, UnackEntry>();
  private readonly knownIds = new Set<string>();
  private unackSweepTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  constructor(config: AmqpQueueConfig) {
    this.config = {
      url: config.url,
      queuePrefix: config.queuePrefix ?? 'agentmesh.',
      pollTimeoutMs: config.pollTimeoutMs ?? 500,
      unackSweepIntervalMs: config.unackSweepIntervalMs ?? 5000,
      prefetchCount: config.prefetchCount ?? 10,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.connection = await connect(this.config.url);

    this.connection.on('error', (err: Error) => {
      console.error('AmqpQueue: connection error', err);
    });

    this.connection.on('close', () => {
      this.connected = false;
    });

    this.publishChannel = await this.connection.createChannel();

    this.unackSweepTimer = setInterval(() => {
      void this.sweepUnacks();
    }, this.config.unackSweepIntervalMs);

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.unackSweepTimer !== null) {
      clearInterval(this.unackSweepTimer);
      this.unackSweepTimer = null;
    }

    for (const consumer of this.consumers.values()) {
      try {
        await consumer.channel.close();
      } catch { /* best-effort */ }
    }
    this.consumers.clear();

    if (this.publishChannel) {
      try { await this.publishChannel.close(); } catch { /* best-effort */ }
      this.publishChannel = null;
    }

    if (this.connection) {
      try { await this.connection.close(); } catch { /* best-effort */ }
      this.connection = null;
    }

    this.connected = false;
  }

  private fullQueueName(logicalName: string): string {
    return `${this.config.queuePrefix}${logicalName}`;
  }

  private getPublishChannel(): Channel {
    if (!this.publishChannel) {
      throw new Error('AmqpQueue: not connected. Call connect() first.');
    }
    return this.publishChannel;
  }

  private async ensureQueue(logicalName: string): Promise<string> {
    const ch = this.getPublishChannel();
    const qName = this.fullQueueName(logicalName);
    await ch.assertQueue(qName, { durable: true });
    return qName;
  }

  private async getOrCreateConsumer(logicalName: string): Promise<QueueConsumer> {
    const existing = this.consumers.get(logicalName);
    if (existing) return existing;

    const ch = await this.connection!.createChannel();
    await ch.prefetch(this.config.prefetchCount);
    const qName = this.fullQueueName(logicalName);
    await ch.assertQueue(qName, { durable: true });

    const { consumerTag } = await ch.consume(
      qName,
      (rawMsg: ConsumeMessage | null) => {
        if (!rawMsg) return;

        const value = rawMsg.content.toString('utf-8');
        let parsed: Message;
        try {
          parsed = JSON.parse(value) as Message;
        } catch {
          parsed = {
            id: rawMsg.properties.messageId ?? undefined,
            payload: value,
            priority: 0,
            timeout: 0,
          };
        }

        if (!parsed.receipt) {
          parsed = { ...parsed, receipt: generateReceipt(logicalName) };
        }

        // Store in unack registry with channel + delivery tag
        if (parsed.receipt) {
          this.unackRegistry.set(parsed.receipt, {
            message: parsed,
            queueName: logicalName,
            channel: ch,
            deliveryTag: rawMsg.fields.deliveryTag,
          });
        }

        // Also buffer for pop/pollMessages
        const pending = this.pendingMessages.get(logicalName) ?? [];
        pending.push(parsed);
        this.pendingMessages.set(logicalName, pending);
      },
      { noAck: false },
    );

    const consumer: QueueConsumer = { channel: ch, queueName: logicalName, consumerTag };
    this.consumers.set(logicalName, consumer);
    return consumer;
  }

  private async drainMessages(
    logicalName: string,
    count: number,
    timeoutMs: number,
  ): Promise<Message[]> {
    await this.getOrCreateConsumer(logicalName);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const pending = this.pendingMessages.get(logicalName) ?? [];
      if (pending.length > 0) {
        const batch = pending.splice(0, count);
        this.pendingMessages.set(logicalName, pending);

        for (const msg of batch) {
          if (msg.id) {
            this.knownIds.add(`${logicalName}:${msg.id}`);
          }
        }

        return batch;
      }

      await sleep(50);
    }

    return [];
  }

  private async sweepUnacks(): Promise<void> {
    const now = Date.now();
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.unackDeadlineMs !== undefined && now >= entry.unackDeadlineMs) {
        this.unackRegistry.delete(receipt);
        try {
          await this.pushMessages(entry.queueName, [entry.message]);
        } catch (err) {
          console.error(`AmqpQueue: failed to re-publish unacked message ${receipt}:`, err);
        }
      }
    }
  }

  private findUnackEntry(
    logicalName: string,
    messageIdOrReceipt: string,
  ): UnackEntry | undefined {
    const direct = this.unackRegistry.get(messageIdOrReceipt);
    if (direct && direct.queueName === logicalName) return direct;

    for (const entry of this.unackRegistry.values()) {
      if (entry.queueName === logicalName && entry.message.id === messageIdOrReceipt) {
        return entry;
      }
    }

    return undefined;
  }

  // ── QueueDAO implementation ────────────────────────────────────────────

  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority?: number,
  ): Promise<void> {
    const qName = await this.ensureQueue(queueName);
    const ch = this.getPublishChannel();
    const msg: Message = { id, priority: priority ?? 0, timeout: offsetTimeInSecond };

    this.knownIds.add(`${queueName}:${id}`);

    ch.sendToQueue(qName, Buffer.from(JSON.stringify(msg)), {
      messageId: id,
      priority: priority ?? 0,
      persistent: true,
    });
  }

  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    const qName = await this.ensureQueue(queueName);
    const ch = this.getPublishChannel();

    for (const msg of messages) {
      ch.sendToQueue(qName, Buffer.from(JSON.stringify(msg)), {
        messageId: msg.id,
        priority: msg.priority ?? 0,
        persistent: true,
      });

      if (msg.id) {
        this.knownIds.add(`${queueName}:${msg.id}`);
      }
    }
  }

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

  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const messages = await this.drainMessages(queueName, count, timeout);
    return messages.map((m) => m.id).filter((id): id is string => id !== undefined);
  }

  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    return this.drainMessages(queueName, count, timeout);
  }

  async remove(queueName: string, messageId: string): Promise<void> {
    const pending = this.pendingMessages.get(queueName);
    if (pending) {
      const filtered = pending.filter((m) => m.id !== messageId);
      this.pendingMessages.set(queueName, filtered);
    }

    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.message.id === messageId && entry.queueName === queueName) {
        try {
          entry.channel.nack({ fields: { deliveryTag: entry.deliveryTag } } as ConsumeMessage, false, false);
        } catch { /* best-effort */ }
        this.unackRegistry.delete(receipt);
        break;
      }
    }

    this.knownIds.delete(`${queueName}:${messageId}`);
  }

  async getSize(queueName: string): Promise<number> {
    try {
      const qName = this.fullQueueName(queueName);
      const ch = this.getPublishChannel();
      const info = await ch.checkQueue(qName);
      return info.messageCount;
    } catch {
      return 0;
    }
  }

  async ack(queueName: string, messageId: string): Promise<boolean> {
    const direct = this.unackRegistry.get(messageId);
    if (direct && direct.queueName === queueName) {
      try {
        direct.channel.ack({ fields: { deliveryTag: direct.deliveryTag } } as ConsumeMessage);
      } catch { /* best-effort */ }
      this.unackRegistry.delete(messageId);
      return true;
    }

    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.message.id === messageId && entry.queueName === queueName) {
        try {
          entry.channel.ack({ fields: { deliveryTag: entry.deliveryTag } } as ConsumeMessage);
        } catch { /* best-effort */ }
        this.unackRegistry.delete(receipt);
        return true;
      }
    }

    return false;
  }

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

  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, messageId);
    if (!entry) return false;

    const candidate = Date.now() + unackTimeout;
    if (entry.unackDeadlineMs === undefined || candidate < entry.unackDeadlineMs) {
      entry.unackDeadlineMs = candidate;
      return true;
    }

    return false;
  }

  async flush(queueName: string): Promise<void> {
    this.pendingMessages.set(queueName, []);

    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (entry.queueName === queueName) {
        this.unackRegistry.delete(receipt);
      }
    }

    try {
      const qName = this.fullQueueName(queueName);
      const ch = this.getPublishChannel();
      await ch.deleteQueue(qName);
      await ch.assertQueue(qName, { durable: true });
    } catch { /* best-effort */ }
  }

  async queuesDetail(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const logicalName of this.consumers.keys()) {
      result[logicalName] = await this.getSize(logicalName);
    }
    return result;
  }

  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    const detail: Record<string, Record<string, Record<string, number>>> = {};
    for (const logicalName of this.consumers.keys()) {
      const size = await this.getSize(logicalName);
      detail[logicalName] = { main: { size, uacked: 0 } };
    }
    return detail;
  }

  async processUnacks(queueName: string): Promise<void> {
    const now = Date.now();
    for (const [receipt, entry] of this.unackRegistry.entries()) {
      if (
        entry.queueName === queueName &&
        entry.unackDeadlineMs !== undefined &&
        now >= entry.unackDeadlineMs
      ) {
        this.unackRegistry.delete(receipt);
        try {
          entry.channel.nack({ fields: { deliveryTag: entry.deliveryTag } } as ConsumeMessage, false, true);
        } catch {
          await this.pushMessages(queueName, [entry.message]);
        }
      }
    }
  }

  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, id);
    if (!entry) return false;

    try {
      entry.channel.nack({ fields: { deliveryTag: entry.deliveryTag } } as ConsumeMessage, false, true);
    } catch { /* best-effort */ }

    for (const [receipt, e] of this.unackRegistry.entries()) {
      if (e === entry) {
        this.unackRegistry.delete(receipt);
        break;
      }
    }

    return true;
  }

  async postpone(
    queueName: string,
    messageId: string,
    _priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    const entry = this.findUnackEntry(queueName, messageId);
    if (!entry) return false;

    const additionalMs = postponeDurationInSeconds * 1000;
    entry.unackDeadlineMs = (entry.unackDeadlineMs ?? Date.now()) + additionalMs;
    return true;
  }

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

  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const pending = this.pendingMessages.get(queueName) ?? [];
    return pending
      .slice(0, count)
      .map((m) => m.id)
      .filter((id): id is string => id !== undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
