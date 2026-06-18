import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class TerminateTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.TERMINATE;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;

    const terminateTask = taskMapperContext.createTaskModel();
    terminateTask.taskType = TaskType.TERMINATE;
    terminateTask.taskDefName = TaskType.TERMINATE;
    terminateTask.startTime = Date.now();
    terminateTask.inputData = { ...taskInput };
    terminateTask.status = 'SCHEDULED';

    return [terminateTask];
  }
}
