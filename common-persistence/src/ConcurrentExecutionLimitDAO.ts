import { TaskModel } from '@conductor/common';

export interface ConcurrentExecutionLimitDAO {
  addTaskToLimit(task: TaskModel): Promise<void>;
  removeTaskFromLimit(task: TaskModel): Promise<void>;
  exceedsLimit(task: TaskModel): Promise<boolean>;
}
