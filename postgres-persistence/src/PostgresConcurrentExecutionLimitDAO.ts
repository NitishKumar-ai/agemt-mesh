import { Kysely } from 'kysely';
import { ConcurrentExecutionLimitDAO, Database } from '@conductor/common-persistence';
import { TaskModel } from '@conductor/common';

export class PostgresConcurrentExecutionLimitDAO implements ConcurrentExecutionLimitDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async addTaskToLimit(task: TaskModel): Promise<void> {
    // No-op for Postgres as it uses task_in_progress table directly in exceedsLimit
  }

  async removeTaskFromLimit(task: TaskModel): Promise<void> {
    // No-op for Postgres
  }

  async exceedsLimit(task: TaskModel): Promise<boolean> {
    const taskDef = task.taskDefinition;
    if (!taskDef || (taskDef.concurrentExecLimit || 0) <= 0) {
      return false;
    }

    const limit = taskDef.concurrentExecLimit!;
    const current = await this.getInProgressTaskCount(task.taskDefName!);

    if (current >= limit) {
      return true;
    }

    const tasksInProgress = await this.findAllTasksInProgressInOrderOfArrival(task.taskDefName!, limit);
    return !tasksInProgress.includes(task.taskId!);
  }

  private async getInProgressTaskCount(taskDefName: string): Promise<number> {
    const row = await this.db
      .selectFrom('task_in_progress')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('task_def_name', '=', taskDefName)
      .where('in_progress_status', '=', true)
      .executeTakeFirst();
    return Number(row?.count || 0);
  }

  private async findAllTasksInProgressInOrderOfArrival(taskDefName: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('task_in_progress')
      .select('task_id')
      .where('task_def_name', '=', taskDefName)
      .orderBy('created_on', 'asc')
      .limit(limit)
      .execute();

    return rows.map((r) => r.task_id);
  }
}
