import { Kysely, sql, Transaction } from 'kysely';
import { BaseKyselyExecutionDAO, Database } from '@agentmesh/common-persistence';
import { TaskModel } from '@agentmesh/common';

export class MySQLExecutionDAO extends BaseKyselyExecutionDAO {
  constructor(db: Kysely<Database>) {
    super(db);
  }

  protected booleanTrue(): unknown {
    return 1;
  }

  protected booleanFalse(): unknown {
    return 0;
  }

  protected toBoolean(val: boolean): unknown {
    return val ? 1 : 0;
  }

  protected async doInsertTask(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx
      .insertInto('task')
      .values({
        task_id: task.taskId!,
        json_data: JSON.stringify(task),
        modified_on: sql`CURRENT_TIMESTAMP`,
      })
      .onDuplicateKeyUpdate({
        json_data: sql`VALUES(json_data)`,
        modified_on: sql`VALUES(modified_on)`,
      })
      .execute();
  }
}
