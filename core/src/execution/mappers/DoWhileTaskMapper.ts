import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class DoWhileTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.DO_WHILE;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const workflowModel = taskMapperContext.workflowModel;
    const workflowTask = taskMapperContext.workflowTask;
    const retryCount = taskMapperContext.retryCount;
    const taskInput = taskMapperContext.taskInput;

    const doWhileTask = taskMapperContext.createTaskModel();
    doWhileTask.taskType = TaskType.DO_WHILE;
    doWhileTask.taskDefName = TaskType.DO_WHILE;
    doWhileTask.inputData = { ...taskInput };
    doWhileTask.startTime = Date.now();
    doWhileTask.status = 'IN_PROGRESS';
    doWhileTask.iteration = 0;

    return [doWhileTask];
  }
}
