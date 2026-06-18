import { TaskModel, TaskDef } from '@conductor/common';

export interface RateLimitingDAO {
  exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean>;
}
