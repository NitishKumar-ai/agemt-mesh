import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

export class Noop extends WorkflowSystemTask {
  constructor() {
    super(TaskType.NOOP);
  }

  override execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    task.status = 'COMPLETED';
    return true;
  }
}
