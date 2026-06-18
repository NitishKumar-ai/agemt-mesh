import { TaskModel, TaskDef } from '@agentmesh/common';

export interface RateLimitingDAO {
  exceedsRateLimitPerFrequency(task: TaskModel, taskDef: TaskDef): Promise<boolean>;
}
