import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@conductor/common';

export class Switch extends WorkflowSystemTask {
  constructor() {
    super(TaskType.SWITCH);
  }

  override execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    task.status = 'COMPLETED';
    return true;
  }
}
