import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

export class Wait extends WorkflowSystemTask {
  constructor() {
    super(TaskType.WAIT);
  }

  override start(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): void {
    task.status = 'IN_PROGRESS';
  }

  override cancel(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): void {
    task.status = 'CANCELED';
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const timeOut = task.waitTimeout;
    if (timeOut === 0) {
      return false;
    }
    if (Date.now() > timeOut) {
      task.status = 'COMPLETED';
      return true;
    }
    return false;
  }

  override getEvaluationOffset(taskModel: TaskModel, maxOffset: number): number | undefined {
    if (taskModel.waitTimeout > 0) {
      const seconds = Math.max(1, Math.floor((taskModel.waitTimeout - Date.now()) / 1000));
      return seconds;
    }
    return undefined;
  }

  override isAsync(): boolean {
    return true;
  }
}
