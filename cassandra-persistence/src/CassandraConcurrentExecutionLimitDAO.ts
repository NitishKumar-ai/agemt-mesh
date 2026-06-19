import { ConcurrentExecutionLimitDAO } from '@agentmesh/common-persistence';
import { TaskModel } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

/**
 * Cassandra implementation of ConcurrentExecutionLimitDAO.
 *
 * Tracks in-flight task executions per task definition using a standard table.
 * Each task ID is stored as a row; the count of rows determines whether the
 * limit has been exceeded.
 *
 * Table schema:
 *   CREATE TABLE concurrent_execution_limits (
 *     task_def_name text,
 *     task_id text,
 *     workflow_id text,
 *     added_at timestamp,
 *     PRIMARY KEY (task_def_name, task_id)
 *   );
 */
export class CassandraConcurrentExecutionLimitDAO extends CassandraBaseDAO implements ConcurrentExecutionLimitDAO {
  constructor(client: Client) {
    super(client);
  }

  async addTaskToLimit(task: TaskModel): Promise<void> {
    const query =
      'INSERT INTO concurrent_execution_limits (task_def_name, task_id, workflow_id, added_at) VALUES (?, ?, ?, ?)';
    await this.client.execute(
      query,
      [task.taskDefName, task.taskId, task.workflowInstanceId, new Date()],
      { prepare: true },
    );
  }

  async removeTaskFromLimit(task: TaskModel): Promise<void> {
    const query = 'DELETE FROM concurrent_execution_limits WHERE task_def_name = ? AND task_id = ?';
    await this.client.execute(query, [task.taskDefName, task.taskId], { prepare: true });
  }

  async exceedsLimit(task: TaskModel): Promise<boolean> {
    const limit =
      typeof task.taskDefinition?.concurrentExecLimit === 'number'
        ? task.taskDefinition.concurrentExecLimit
        : undefined;

    if (!limit || limit <= 0) {
      return false;
    }

    const countQuery =
      'SELECT COUNT(*) AS count FROM concurrent_execution_limits WHERE task_def_name = ?';
    const result = await this.client.execute(countQuery, [task.taskDefName], { prepare: true });
    const count = Number(result.first()?.get('count') ?? 0);
    return count >= limit;
  }
}
