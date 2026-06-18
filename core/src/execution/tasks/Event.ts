import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@conductor/common';

export class Event extends WorkflowSystemTask {
  constructor() {
    super(TaskType.EVENT);
  }

  override start(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): void {
    task.status = 'IN_PROGRESS';
    task.outputData['event'] = task.inputData['sink'];
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    task.status = 'COMPLETED';
    return true;
  }
}
