import { Kysely } from 'kysely';
import { RateLimitingDAO, Database } from '@conductor/common-persistence';
import { TaskModel, TaskDef } from '@conductor/common';

export class PostgresRateLimitingDAO implements RateLimitingDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean> {
    // Dummy implementation as per Java PostgresExecutionDAO
    return false;
  }
}
