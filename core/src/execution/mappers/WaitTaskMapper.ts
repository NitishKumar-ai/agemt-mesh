import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class WaitTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.WAIT;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;
    const workflowTask = taskMapperContext.workflowTask;

    const waitTask = taskMapperContext.createTaskModel();
    waitTask.taskType = TaskType.WAIT;
    waitTask.taskDefName = TaskType.WAIT;
    waitTask.startTime = Date.now();
    waitTask.inputData = { ...taskInput };
    waitTask.status = 'SCHEDULED';

    const duration = taskInput['duration'];
    const untilStr = taskInput['until'] as string | undefined;

    if (duration != null) {
      const durationSeconds = Number(duration);
      waitTask.waitTimeout = Date.now() + durationSeconds * 1000;
    } else if (untilStr != null) {
      const untilMs = Date.parse(untilStr);
      if (!isNaN(untilMs)) {
        waitTask.waitTimeout = untilMs;
      }
    }

    return [waitTask];
  }
}
