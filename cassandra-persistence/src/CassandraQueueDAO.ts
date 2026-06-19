import { QueueDAO } from '@agentmesh/common-persistence';
import { Message } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { types } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

const { TimeUuid } = types;

/**
 * Cassandra implementation of QueueDAO.
 *
 * Uses a dual-table design to work around Cassandra's single-clustering-key
 * limitation:
 *
 *   queue_messages          — PRIMARY KEY ((queue_name), message_id)
 *     Stores the full message payload and state (popped, deliver_on, etc.).
 *     Used for direct lookups by message_id (ack, remove, containsMessage).
 *
 *   queue_messages_by_time  — PRIMARY KEY ((queue_name), created_on)
 *     Stores only (message_id) ordered by created_on ASC.
 *     Used for FIFO pop / pollMessages.
 *
 * Pop uses a Lightweight Transaction (LWT) on queue_messages to claim a
 * message atomically: `UPDATE ... SET popped=true WHERE ... IF popped=false`.
 * This prevents multiple consumers from claiming the same message.
 *
 * Expected CQL schema:
 *   CREATE TABLE queue_messages (
 *     queue_name text,
 *     message_id text,
 *     payload text,
 *     priority int,
 *     offset_time_seconds int,
 *     deliver_on timestamp,
 *     created_on timeuuid,
 *     popped boolean,
 *     PRIMARY KEY (queue_name, message_id)
 *   );
 *
 *   CREATE TABLE queue_messages_by_time (
 *     queue_name text,
 *     created_on timeuuid,
 *     message_id text,
 *     PRIMARY KEY (queue_name, created_on)
 *   ) WITH CLUSTERING ORDER BY (created_on ASC);
 */
export class CassandraQueueDAO extends CassandraBaseDAO implements QueueDAO {
  constructor(client: Client) {
    super(client);
  }

  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority: number = 0,
  ): Promise<void> {
    const createdOn = TimeUuid.now();
    const deliverOn = offsetTimeInSecond > 0
      ? new Date(Date.now() + offsetTimeInSecond * 1000)
      : new Date();

    // Upsert — insert or update deliver_on if already exists
    await this.client.execute(
      `INSERT INTO queue_messages (queue_name, message_id, priority, offset_time_seconds, deliver_on, created_on, popped)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [queueName, id, priority, offsetTimeInSecond, deliverOn, createdOn, false],
      { prepare: true },
    );

    // Also write to the time-ordered index
    await this.client.execute(
      `INSERT INTO queue_messages_by_time (queue_name, created_on, message_id) VALUES (?, ?, ?)`,
      [queueName, createdOn, id],
      { prepare: true },
    );
  }

  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    const queries: { query: string; params: any[] }[] = [];

    for (const msg of messages) {
      const createdOn = TimeUuid.now();
      const id = msg.id ?? createdOn.toString();
      const deliverOn = new Date();

      queries.push({
        query: `INSERT INTO queue_messages (queue_name, message_id, payload, priority, offset_time_seconds, deliver_on, created_on, popped)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [queueName, id, msg.payload ?? '', msg.priority ?? 0, 0, deliverOn, createdOn, false],
      });
      queries.push({
        query: `INSERT INTO queue_messages_by_time (queue_name, created_on, message_id) VALUES (?, ?, ?)`,
        params: [queueName, createdOn, id],
      });
    }

    await this.client.batch(queries, { prepare: true });
  }

  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority: number = 0,
  ): Promise<boolean> {
    // Check if the message already exists
    const existing = await this.client.execute(
      'SELECT message_id FROM queue_messages WHERE queue_name = ? AND message_id = ?',
      [queueName, id],
      { prepare: true },
    );
    if (existing.rowLength > 0) {
      return false;
    }

    await this.push(queueName, id, offsetTimeInSecond, priority);
    return true;
  }

  async pop(queueName: string, count: number, _timeout: number): Promise<string[]> {
    const messages = await this.pollMessages(queueName, count, 0);
    return messages.map((m) => m.id!).filter(Boolean);
  }

  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    const start = Date.now();
    const messages: Message[] = [];

    while (true) {
      // Read the oldest non-claimed messages from the time index
      // (Cassandra allows LIMIT but we need to filter out already-claimed ones)
      const indexResult = await this.client.execute(
        'SELECT created_on, message_id FROM queue_messages_by_time WHERE queue_name = ? ORDER BY created_on ASC LIMIT ?',
        [queueName, count * 2], // fetch extra to account for already-claimed messages
        { prepare: true },
      );

      if (indexResult.rowLength === 0 && messages.length === 0) {
        return messages;
      }

      // Try to claim each message via LWT
      for (const row of indexResult.rows) {
        if (messages.length >= count) break;

        const messageId = row.get('message_id');

        // LWT: only claim if not already popped and deliver_on has passed
        const lwtResult = await this.client.execute(
          `UPDATE queue_messages SET popped = true WHERE queue_name = ? AND message_id = ? IF popped = false`,
          [queueName, messageId],
          { prepare: true },
        );

        if (lwtResult.wasApplied()) {
          // Check deliver_on
          const msgResult = await this.client.execute(
            'SELECT message_id, payload, priority, deliver_on, created_on FROM queue_messages WHERE queue_name = ? AND message_id = ?',
            [queueName, messageId],
            { prepare: true },
          );

          if (msgResult.rowLength > 0) {
            const msg = msgResult.first()!;
            const deliverOn = msg.get('deliver_on') as Date | null;

            if (deliverOn && deliverOn.getTime() <= Date.now()) {
              messages.push({
                id: msg.get('message_id'),
                payload: msg.get('payload') ?? undefined,
                priority: msg.get('priority') ?? 0,
              } as Message);
            } else if (deliverOn && deliverOn.getTime() > Date.now()) {
              // Message is scheduled for later — un-claim it
              await this.client.execute(
                'UPDATE queue_messages SET popped = false WHERE queue_name = ? AND message_id = ?',
                [queueName, messageId],
                { prepare: true },
              );
            }
          }
        }
      }

      if (messages.length >= count) {
        return messages;
      }

      if (timeout > 0 && Date.now() - start > timeout) {
        return messages;
      }

      // Wait briefly before retrying if no messages were claimed
      if (indexResult.rowLength > 0 && messages.length > 0) {
        return messages;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async remove(queueName: string, messageId: string): Promise<void> {
    // Look up created_on to delete from the time index
    const msgResult = await this.client.execute(
      'SELECT created_on FROM queue_messages WHERE queue_name = ? AND message_id = ?',
      [queueName, messageId],
      { prepare: true },
    );

    const queries: { query: string; params: any[] }[] = [
      {
        query: 'DELETE FROM queue_messages WHERE queue_name = ? AND message_id = ?',
        params: [queueName, messageId],
      },
    ];

    const createdOn = msgResult.first()?.get('created_on');
    if (createdOn) {
      queries.push({
        query: 'DELETE FROM queue_messages_by_time WHERE queue_name = ? AND created_on = ?',
        params: [queueName, createdOn],
      });
    }

    await this.client.batch(queries, { prepare: true });
  }

  async getSize(queueName: string): Promise<number> {
    const result = await this.client.execute(
      'SELECT COUNT(*) AS count FROM queue_messages WHERE queue_name = ?',
      [queueName],
      { prepare: true },
    );
    return Number(result.first()?.get('count') ?? 0);
  }

  async ack(queueName: string, messageId: string): Promise<boolean> {
    // Look up created_on to also remove from the time index
    const msgResult = await this.client.execute(
      'SELECT created_on FROM queue_messages WHERE queue_name = ? AND message_id = ?',
      [queueName, messageId],
      { prepare: true },
    );
    if (msgResult.rowLength === 0) return false;

    const createdOn = msgResult.first()!.get('created_on');

    const queries: { query: string; params: any[] }[] = [
      {
        query: 'DELETE FROM queue_messages WHERE queue_name = ? AND message_id = ?',
        params: [queueName, messageId],
      },
    ];
    if (createdOn) {
      queries.push({
        query: 'DELETE FROM queue_messages_by_time WHERE queue_name = ? AND created_on = ?',
        params: [queueName, createdOn],
      });
    }

    await this.client.batch(queries, { prepare: true });
    return true;
  }

  async setUnackTimeout(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const deliverOn = new Date(Date.now() + unackTimeout);
    const result = await this.client.execute(
      'UPDATE queue_messages SET popped = false, deliver_on = ? WHERE queue_name = ? AND message_id = ?',
      [deliverOn, queueName, messageId],
      { prepare: true },
    );
    return result.rowLength > 0;
  }

  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    // Read current deliver_on to compare
    const msgResult = await this.client.execute(
      'SELECT deliver_on FROM queue_messages WHERE queue_name = ? AND message_id = ?',
      [queueName, messageId],
      { prepare: true },
    );
    if (msgResult.rowLength === 0) return false;

    const currentDeliverOn = msgResult.first()!.get('deliver_on') as Date | null;
    const newDeliverOn = new Date(Date.now() + unackTimeout);

    if (currentDeliverOn && currentDeliverOn.getTime() <= Date.now()) {
      // Already past due — update regardless
      await this.client.execute(
        'UPDATE queue_messages SET popped = false, deliver_on = ? WHERE queue_name = ? AND message_id = ?',
        [newDeliverOn, queueName, messageId],
        { prepare: true },
      );
      return true;
    }

    if (!currentDeliverOn || newDeliverOn.getTime() < currentDeliverOn.getTime()) {
      // New deadline is shorter — update
      await this.client.execute(
        'UPDATE queue_messages SET popped = false, deliver_on = ? WHERE queue_name = ? AND message_id = ?',
        [newDeliverOn, queueName, messageId],
        { prepare: true },
      );
      return true;
    }

    return false;
  }

  async flush(queueName: string): Promise<void> {
    // Delete all messages for this queue
    const msgResult = await this.client.execute(
      'SELECT message_id FROM queue_messages WHERE queue_name = ?',
      [queueName],
      { prepare: true },
    );

    const queries: { query: string; params: any[] }[] = [];
    for (const row of msgResult.rows) {
      queries.push({
        query: 'DELETE FROM queue_messages WHERE queue_name = ? AND message_id = ?',
        params: [queueName, row.get('message_id')],
      });
    }

    // Also clear from time index
    const timeResult = await this.client.execute(
      'SELECT created_on FROM queue_messages_by_time WHERE queue_name = ?',
      [queueName],
      { prepare: true },
    );
    for (const row of timeResult.rows) {
      queries.push({
        query: 'DELETE FROM queue_messages_by_time WHERE queue_name = ? AND created_on = ?',
        params: [queueName, row.get('created_on')],
      });
    }

    if (queries.length > 0) {
      await this.client.batch(queries, { prepare: true });
    }
  }

  async queuesDetail(): Promise<Record<string, number>> {
    const result = await this.client.execute(
      'SELECT queue_name, COUNT(*) AS count FROM queue_messages GROUP BY queue_name',
    );
    const details: Record<string, number> = {};
    for (const row of result.rows) {
      details[row.get('queue_name')] = Number(row.get('count'));
    }
    return details;
  }

  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    const result = await this.client.execute(
      'SELECT queue_name, popped, COUNT(*) AS count FROM queue_messages GROUP BY queue_name, popped',
    );
    const details: Record<string, Record<string, Record<string, number>>> = {};

    for (const row of result.rows) {
      const queueName: string = row.get('queue_name');
      const popped: boolean = row.get('popped');
      const count: number = Number(row.get('count'));

      details[queueName] ??= { a: { size: 0, uacked: 0 } };
      const a = (details[queueName] as { a: { size: number; uacked: number } }).a;
      if (popped) {
        a.uacked += count;
      } else {
        a.size += count;
      }
    }

    return details;
  }

  async processUnacks(queueName: string): Promise<void> {
    // Find messages that are popped but past their deliver_on
    const staleMessages = await this.client.execute(
      'SELECT message_id, deliver_on FROM queue_messages WHERE queue_name = ? AND popped = true ALLOW FILTERING',
      [queueName],
      { prepare: true },
    );

    const now = new Date();
    const queries: { query: string; params: any[] }[] = [];

    for (const row of staleMessages.rows) {
      const deliverOn = row.get('deliver_on') as Date | null;
      if (deliverOn && deliverOn.getTime() <= now.getTime() - 60000) {
        // Stale for more than 60 seconds — re-queue
        queries.push({
          query: 'UPDATE queue_messages SET popped = false WHERE queue_name = ? AND message_id = ?',
          params: [queueName, row.get('message_id')],
        });
      }
    }

    if (queries.length > 0) {
      await this.client.batch(queries, { prepare: true });
    }
  }

  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const result = await this.client.execute(
      'UPDATE queue_messages SET popped = false, deliver_on = ? WHERE queue_name = ? AND message_id = ?',
      [new Date(), queueName, id],
      { prepare: true },
    );
    return result.rowLength > 0;
  }

  async postpone(
    queueName: string,
    messageId: string,
    priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    const deliverOn = new Date(Date.now() + postponeDurationInSeconds * 1000);
    const result = await this.client.execute(
      'UPDATE queue_messages SET popped = false, priority = ?, deliver_on = ? WHERE queue_name = ? AND message_id = ?',
      [priority, deliverOn, queueName, messageId],
      { prepare: true },
    );
    return result.rowLength > 0;
  }

  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    const result = await this.client.execute(
      'SELECT message_id FROM queue_messages WHERE queue_name = ? AND message_id = ?',
      [queueName, messageId],
      { prepare: true },
    );
    return result.rowLength > 0;
  }

  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const result = await this.client.execute(
      'SELECT message_id FROM queue_messages_by_time WHERE queue_name = ? ORDER BY created_on ASC LIMIT ?',
      [queueName, count],
      { prepare: true },
    );
    return result.rows.map((row) => row.get('message_id') as string);
  }
}
