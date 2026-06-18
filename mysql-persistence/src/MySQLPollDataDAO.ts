import { Kysely, sql } from 'kysely';
import { PollDataDAO, Database } from '@agentmesh/common-persistence';
import { PollData } from '@agentmesh/common';

export class MySQLPollDataDAO implements PollDataDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async updateLastPollData(
    taskDefName: string,
    domain: string | undefined,
    workerId: string,
  ): Promise<void> {
    const effectiveDomain = domain ?? 'DEFAULT';
    const pollData: PollData = {
      queueName: taskDefName,
      domain: effectiveDomain,
      workerId,
      lastPollTime: Date.now(),
    };

    const updateResult = await this.db
      .updateTable('poll_data')
      .set({
        json_data: JSON.stringify(pollData),
      })
      .where('queue_name', '=', taskDefName)
      .where('domain', '=', effectiveDomain)
      .executeTakeFirst();

    if (updateResult.numUpdatedRows === 0n) {
      await this.db
        .insertInto('poll_data')
        .values({
          queue_name: taskDefName,
          domain: effectiveDomain,
          json_data: JSON.stringify(pollData),
        })
        .onDuplicateKeyUpdate({
          json_data: sql`VALUES(json_data)`
        })

        .execute();
    }
  }

  async getPollData(taskDefName: string, domain: string | undefined): Promise<PollData | undefined> {
    const effectiveDomain = domain ?? 'DEFAULT';
    const row = await this.db
      .selectFrom('poll_data')
      .select('json_data')
      .where('queue_name', '=', taskDefName)
      .where('domain', '=', effectiveDomain)
      .executeTakeFirst();

    return row ? JSON.parse(row.json_data) : undefined;
  }

  async getPollDataForTask(taskDefName: string): Promise<PollData[]> {
    const rows = await this.db
      .selectFrom('poll_data')
      .select('json_data')
      .where('queue_name', '=', taskDefName)
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getAllPollData(): Promise<PollData[]> {
    const rows = await this.db
      .selectFrom('poll_data')
      .select('json_data')
      .orderBy('queue_name')
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }
}
