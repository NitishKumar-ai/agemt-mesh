import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';
import { getNextTask } from '../ExecutorUtils.js';

export class ForkJoinTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.FORK_JOIN;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const workflowTask = taskMapperContext.workflowTask;
    const taskInput = taskMapperContext.taskInput;
    const workflowModel = taskMapperContext.workflowModel;
    const retryCount = taskMapperContext.retryCount;

    const tasksToBeScheduled: TaskModel[] = [];

    const forkTask = taskMapperContext.createTaskModel();
    forkTask.taskType = TaskType.FORK_JOIN;
    forkTask.taskDefName = TaskType.FORK_JOIN;
    const now = Date.now();
    forkTask.startTime = now;
    forkTask.endTime = now;
    forkTask.inputData = taskInput;
    forkTask.status = 'COMPLETED';
    tasksToBeScheduled.push(forkTask);

    const forkTasks = workflowTask.forkTasks ?? [];
    for (const wfts of forkTasks) {
      const wft = wfts[0];
      if (!wft) continue;
      const tasks2 = taskMapperContext.deciderService.getTasksToBeScheduled(
        workflowModel,
        wft,
        retryCount,
      );
      tasksToBeScheduled.push(...tasks2);
    }

    const joinWorkflowTask = workflowModel.workflowDefinition
      ? getNextTask(workflowModel.workflowDefinition, workflowTask.taskReferenceName)
      : null;

    if (!joinWorkflowTask || joinWorkflowTask.type !== TaskType.JOIN) {
      throw new Error('Fork task definition is not followed by a join task. Check the blueprint');
    }

    const joinTask = taskMapperContext.deciderService.getTasksToBeScheduled(
      workflowModel,
      joinWorkflowTask,
      retryCount,
    );
    tasksToBeScheduled.push(...joinTask);

    return tasksToBeScheduled;
  }
}
