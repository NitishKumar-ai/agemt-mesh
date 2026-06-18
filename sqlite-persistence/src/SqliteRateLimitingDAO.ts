import { Kysely } from 'kysely';
import { RateLimitingDAO, Database } from '@agentmesh/common-persistence';
import { TaskModel, TaskDef } from '@agentmesh/common';

export class SqliteRateLimitingDAO implements RateLimitingDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean> {
    return false;
  }
}
