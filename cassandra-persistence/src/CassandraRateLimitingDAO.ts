import { RateLimitingDAO } from '@agentmesh/common-persistence';
import { TaskModel, TaskDef } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

/**
 * Cassandra implementation of RateLimitingDAO.
 *
 * Uses a counter table keyed by task definition name. The counter TTL is
 * managed via the window duration — a new row is inserted for each unique
 * (task_def_name, window_start) pair and the count increments within that
 * window. When the window expires, the row is no longer read.
 *
 * Table schema:
 *   CREATE TABLE rate_limit_counters (
 *     task_def_name text,
 *     window_start timestamp,
 *     count counter,
 *     PRIMARY KEY (task_def_name, window_start)
 *   );
 */
export class CassandraRateLimitingDAO extends CassandraBaseDAO implements RateLimitingDAO {
  constructor(client: Client) {
    super(client);
  }

  async exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean> {
    if (!taskDef.rateLimitPerFrequency || taskDef.rateLimitPerFrequency <= 0) {
      return false;
    }

    const limit = taskDef.rateLimitPerFrequency;
    const windowSecs = taskDef.rateLimitFrequencyInSeconds || 1;

    // Round the current time to the current window
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSecs * 1000)) * (windowSecs * 1000);

    // Increment the counter for this window
    const query =
      'UPDATE rate_limit_counters SET count = count + 1 WHERE task_def_name = ? AND window_start = ?';
    await this.client.execute(query, [taskDef.name, new Date(windowStart)], {
      prepare: true,
    });

    // Read the current count
    const selectQuery = 'SELECT count FROM rate_limit_counters WHERE task_def_name = ? AND window_start = ?';
    const result = await this.client.execute(selectQuery, [taskDef.name, new Date(windowStart)], {
      prepare: true,
    });

    const count = result.first()?.get('count') ?? 0;
    return Number(count) > limit;
  }
}
