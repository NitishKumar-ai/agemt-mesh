import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class SimpleTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.SIMPLE;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;

    const task = taskMapperContext.createTaskModel();
    task.taskType = TaskType.SIMPLE;
    task.taskDefName = taskMapperContext.workflowTask.name ?? '';
    task.startTime = Date.now();
    task.inputData = { ...taskInput };
    task.status = 'SCHEDULED';

    return [task];
  }
}
