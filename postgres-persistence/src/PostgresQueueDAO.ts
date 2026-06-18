import { Kysely, sql } from 'kysely';
import { QueueDAO, Database } from '@agentmesh/common-persistence';
import { Message } from '@agentmesh/common';

export class PostgresQueueDAO implements QueueDAO {
  constructor(private readonly db: Kysely<Database>) {}

  private async createQueueIfNotExists(queueName: string): Promise<void> {
    const exists = await this.db
      .selectFrom('queue')
      .select('id')
      .where('queue_name', '=', queueName)
      .limit(1)
      .executeTakeFirst();

    if (!exists) {
      await this.db
        .insertInto('queue')
        .values({ queue_name: queueName })
        .onConflict((oc) => oc.column('queue_name').doNothing())
        .execute();
    }
  }

  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority: number = 0,
  ): Promise<void> {
    await this.createQueueIfNotExists(queueName);

    const updateResult = await this.db
      .updateTable('queue_message')
      .set({
        deliver_on: sql`current_timestamp + (${offsetTimeInSecond} || ' seconds')::interval`,
      })
      .where('queue_name', '=', queueName)
      .where('message_id', '=', id)
      .executeTakeFirst();

    if (updateResult.numUpdatedRows === 0n) {
      await this.db
        .insertInto('queue_message')
        .values({
          queue_name: queueName,
          message_id: id,
          priority,
          popped: false,
          offset_time_seconds: offsetTimeInSecond.toString(),
          deliver_on: sql`current_timestamp + (${offsetTimeInSecond} || ' seconds')::interval`,
        })
        .onConflict((oc) =>
          oc.columns(['queue_name', 'message_id']).doUpdateSet({
            deliver_on: sql`excluded.deliver_on`,
          }),
        )
        .execute();
    }
  }

  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    for (const msg of messages) {
      await this.createQueueIfNotExists(queueName);
      await this.db
        .insertInto('queue_message')
        .values({
          queue_name: queueName,
          message_id: msg.id!,
          priority: msg.priority || 0,
          popped: false,
          offset_time_seconds: '0',
          deliver_on: sql`current_timestamp`,
          payload: msg.payload || null,
        })
        .onConflict((oc) =>
          oc.columns(['queue_name', 'message_id']).doUpdateSet({
            payload: sql`excluded.payload`,
            deliver_on: sql`excluded.deliver_on`,
          }),
        )
        .execute();
    }
  }

  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority: number = 0,
  ): Promise<boolean> {
    await this.createQueueIfNotExists(queueName);

    const result = await this.db
      .insertInto('queue_message')
      .values({
        queue_name: queueName,
        message_id: id,
        priority,
        popped: false,
        offset_time_seconds: offsetTimeInSecond.toString(),
        deliver_on: sql`current_timestamp + (${offsetTimeInSecond} || ' seconds')::interval`,
      })
      .onConflict((oc) => oc.columns(['queue_name', 'message_id']).doNothing())
      .executeTakeFirst();

    return result.numInsertedOrUpdatedRows !== undefined && result.numInsertedOrUpdatedRows > 0n;
  }

  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    const messages = await this.pollMessages(queueName, count, timeout);
    return messages.map((m) => m.id!);
  }

  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    if (timeout < 1) {
      return this._popMessages(queueName, count);
    }

    const start = Date.now();
    const messages: Message[] = [];

    while (true) {
      const messagesSlice = await this._popMessages(queueName, count - messages.length);
      messages.push(...messagesSlice);

      if (messages.length >= count || Date.now() - start > timeout) {
        return messages;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async _popMessages(queueName: string, count: number): Promise<Message[]> {
    const popped = await this.db
      .with('cte', (db) =>
        db
          .selectFrom('queue_message')
          .select(['queue_name', 'message_id'])
          .where('queue_name', '=', queueName)
          .where('popped', '=', false)
          .where('deliver_on', '<=', sql<Date>`current_timestamp + interval '1000 microseconds'`)
          .orderBy('deliver_on')
          .orderBy('priority', 'desc')
          .orderBy('created_on')
          .limit(count)
          .forUpdate()
          .skipLocked(),
      )
      .updateTable('queue_message')
      .from('cte')
      .set({ popped: true })
      .whereRef('queue_message.queue_name', '=', 'cte.queue_name')
      .whereRef('queue_message.message_id', '=', 'cte.message_id')
      .where('queue_message.popped', '=', false)
      .returning([
        'queue_message.message_id as id',
        'queue_message.priority',
        'queue_message.payload',
      ])
      .execute();

    return popped.map(
      (row) =>
        ({
          id: row.id,
          priority: row.priority,
          payload: row.payload || undefined,
        }) as Message,
    );
  }

  async remove(queueName: string, messageId: string): Promise<void> {
    await this.db
      .deleteFrom('queue_message')
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .execute();
  }

  async getSize(queueName: string): Promise<number> {
    const row = await this.db
      .selectFrom('queue_message')
      .select((db) => db.fn.count<number>('message_id').as('count'))
      .where('queue_name', '=', queueName)
      .executeTakeFirst();
    return Number(row?.count || 0);
  }

  async ack(queueName: string, messageId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('queue_message')
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async setUnackTimeout(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const updatedOffsetTimeInSecond = Math.floor(unackTimeout / 1000);
    const result = await this.db
      .updateTable('queue_message')
      .set({
        offset_time_seconds: updatedOffsetTimeInSecond.toString(),
        deliver_on: sql`current_timestamp + (${updatedOffsetTimeInSecond} || ' seconds')::interval`,
      })
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .executeTakeFirst();
    return result.numUpdatedRows === 1n;
  }

  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    const updatedOffsetTimeInSecond = Math.floor(unackTimeout / 1000);
    const result = await this.db
      .updateTable('queue_message')
      .set({
        offset_time_seconds: updatedOffsetTimeInSecond.toString(),
        deliver_on: sql`current_timestamp + (${updatedOffsetTimeInSecond} || ' seconds')::interval`,
      })
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .where(
        'deliver_on',
        '>',
        sql<Date>`current_timestamp + (${updatedOffsetTimeInSecond} || ' seconds')::interval`,
      )
      .executeTakeFirst();
    return result.numUpdatedRows === 1n;
  }

  async flush(queueName: string): Promise<void> {
    await this.db.deleteFrom('queue_message').where('queue_name', '=', queueName).execute();
  }

  async queuesDetail(): Promise<Record<string, number>> {
    const rows = await this.db
      .selectFrom('queue')
      .select([
        'queue_name',
        (eb) =>
          eb
            .selectFrom('queue_message')
            .select(sql<number>`count(*)`.as('size'))
            .whereRef('queue_message.queue_name', '=', 'queue.queue_name')
            .where('popped', '=', false)
            .as('size'),
      ])
      // omitting forShare for now to fix typings
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.queue_name] = Number(row.size || 0);
    }
    return result;
  }

  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    const rows = await this.db
      .selectFrom('queue')
      .select([
        'queue_name',
        (eb) =>
          eb
            .selectFrom('queue_message')
            .select(sql<number>`count(*)`.as('size'))
            .whereRef('queue_message.queue_name', '=', 'queue.queue_name')
            .where('popped', '=', false)
            .as('size'),
        (eb) =>
          eb
            .selectFrom('queue_message')
            .select(sql<number>`count(*)`.as('uacked'))
            .whereRef('queue_message.queue_name', '=', 'queue.queue_name')
            .where('popped', '=', true)
            .as('uacked'),
      ])
      .execute();

    const result: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of rows) {
      result[row.queue_name] = {
        a: {
          size: Number(row.size || 0),
          uacked: Number(row.uacked || 0),
        },
      };
    }
    return result;
  }

  async processUnacks(queueName: string): Promise<void> {
    await this.db
      .updateTable('queue_message')
      .set({ popped: false })
      .where('queue_name', '=', queueName)
      .where('popped', '=', true)
      .where('deliver_on', '<', sql<Date>`current_timestamp - interval '60 seconds'`)
      .execute();
  }

  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('queue_message')
      .set({
        offset_time_seconds: '0',
        deliver_on: sql`current_timestamp`,
      })
      .where('queue_name', '=', queueName)
      .where('message_id', '=', id)
      .executeTakeFirst();
    return result.numUpdatedRows === 1n;
  }

  async postpone(
    queueName: string,
    messageId: string,
    priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('queue_message')
      .set({
        priority,
        deliver_on: sql`current_timestamp + (${postponeDurationInSeconds} || ' seconds')::interval`,
      })
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .executeTakeFirst();
    return result.numUpdatedRows === 1n;
  }

  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('queue_message')
      .select(sql<number>`1`.as('exists'))
      .where('queue_name', '=', queueName)
      .where('message_id', '=', messageId)
      .limit(1)
      .executeTakeFirst();
    return result !== undefined;
  }

  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('queue_message')
      .select('message_id')
      .where('queue_name', '=', queueName)
      .where('popped', '=', false)
      .orderBy('deliver_on')
      .orderBy('priority', 'desc')
      .orderBy('created_on')
      .limit(count)
      .execute();
    return rows.map((r) => r.message_id);
  }
}
