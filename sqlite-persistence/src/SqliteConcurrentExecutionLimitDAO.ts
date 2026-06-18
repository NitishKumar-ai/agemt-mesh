import { Kysely, sql } from 'kysely';
import { ConcurrentExecutionLimitDAO, Database } from '@agentmesh/common-persistence';
import { TaskModel } from '@agentmesh/common';

export class SqliteConcurrentExecutionLimitDAO implements ConcurrentExecutionLimitDAO {
  constructor(private readonly db: Kysely<Database>) {}

  // No-ops: the task_in_progress table (maintained by ExecutionDAO) is the source
  // of truth for concurrency, so no separate per-limit bookkeeping is needed.
  async addTaskToLimit(_task: TaskModel): Promise<void> {}
  async removeTaskFromLimit(_task: TaskModel): Promise<void> {}

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
      .where('in_progress_status', '=', sql<boolean>`1`)
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
