import type { TaskModel } from '../types.js';
import type { TaskMapperContext } from './TaskMapperContext.js';

export interface TaskMapper {
  getTaskType(): string;
  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[];
}
