import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType, type WorkflowTask } from '@conductor/common';
import { getNextTask } from '../ExecutorUtils.js';

export class ForkJoinDynamicTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.FORK_JOIN_DYNAMIC;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const workflowTask = taskMapperContext.workflowTask;
    const taskInput = taskMapperContext.taskInput;
    const workflowModel = taskMapperContext.workflowModel;
    const retryCount = taskMapperContext.retryCount;

    const tasksToBeScheduled: TaskModel[] = [];

    const forkTask = taskMapperContext.createTaskModel();
    forkTask.taskType = TaskType.FORK_JOIN_DYNAMIC;
    forkTask.taskDefName = TaskType.FORK_JOIN_DYNAMIC;
    const now = Date.now();
    forkTask.startTime = now;
    forkTask.endTime = now;
    forkTask.inputData = taskInput;
    forkTask.status = 'COMPLETED';
    tasksToBeScheduled.push(forkTask);

    const dynamicForkTasksParamName = workflowTask.dynamicForkTasksParam ?? 'dynamicTasks';
    const dynamicTasks = taskInput[dynamicForkTasksParamName] as unknown[];
    if (Array.isArray(dynamicTasks)) {
      for (const dyn of dynamicTasks) {
        const wft = dyn as WorkflowTask;
        const tasks = taskMapperContext.deciderService.getTasksToBeScheduled(
          workflowModel,
          wft,
          retryCount,
        );
        tasksToBeScheduled.push(...tasks);
      }
    }

    const joinWorkflowTask = workflowModel.workflowDefinition
      ? getNextTask(workflowModel.workflowDefinition, workflowTask.taskReferenceName)
      : null;

    if (!joinWorkflowTask) {
      return tasksToBeScheduled;
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
