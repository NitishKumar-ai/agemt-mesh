import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class JoinTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.JOIN;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const workflowTask = taskMapperContext.workflowTask;

    const joinInput: Record<string, unknown> = {};
    joinInput['joinOn'] = workflowTask.joinOn;

    const joinTask = taskMapperContext.createTaskModel();
    joinTask.taskType = workflowTask.type;
    joinTask.taskDefName = workflowTask.type;
    joinTask.startTime = Date.now();
    joinTask.inputData = joinInput;
    joinTask.status = 'IN_PROGRESS';

    return [joinTask];
  }
}
