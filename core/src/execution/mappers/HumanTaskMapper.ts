import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class HumanTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.HUMAN;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;

    const humanTask = taskMapperContext.createTaskModel();
    humanTask.taskType = TaskType.HUMAN;
    humanTask.taskDefName = TaskType.HUMAN;
    humanTask.startTime = Date.now();
    humanTask.inputData = { ...taskInput };
    humanTask.status = 'SCHEDULED';

    return [humanTask];
  }
}
