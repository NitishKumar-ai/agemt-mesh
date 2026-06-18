import { Kysely, sql, Transaction } from 'kysely';
import { BaseKyselyExecutionDAO, Database } from '@conductor/common-persistence';
import { TaskModel } from '@conductor/common';

export class PostgresExecutionDAO extends BaseKyselyExecutionDAO {
  constructor(db: Kysely<Database>) {
    super(db);
  }

  protected booleanTrue(): unknown {
    return true;
  }

  protected booleanFalse(): unknown {
    return false;
  }

  protected toBoolean(val: boolean): unknown {
    return val;
  }

  protected async doInsertTask(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx
      .insertInto('task')
      .values({
        task_id: task.taskId!,
        json_data: JSON.stringify(task),
      })
      .onConflict((oc) =>
        oc.column('task_id').doUpdateSet({
          json_data: sql`excluded.json_data`,
          modified_on: sql`excluded.modified_on`,
        }),
      )
      .execute();
  }
}
