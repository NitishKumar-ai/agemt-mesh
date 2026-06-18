import { Kysely, sql, Transaction } from 'kysely';
import { BaseKyselyExecutionDAO, Database } from '@agentmesh/common-persistence';
import { TaskModel } from '@agentmesh/common';

export class SqliteExecutionDAO extends BaseKyselyExecutionDAO {
  constructor(db: Kysely<Database>) {
    super(db);
  }

  protected booleanTrue(): unknown {
    return sql<boolean>`1`;
  }

  protected booleanFalse(): unknown {
    return sql<boolean>`0`;
  }

  protected toBoolean(val: boolean): unknown {
    return val ? sql<boolean>`1` : sql<boolean>`0`;
  }

  protected async doInsertTask(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx
      .insertInto('task')
      .values({
        task_id: task.taskId!,
        json_data: JSON.stringify(task),
      })
      .onConflict((oc) =>
        oc.doUpdateSet({
          json_data: sql`excluded.json_data`,
          modified_on: sql`excluded.modified_on`,
        }),
      )
      .execute();
  }
}
