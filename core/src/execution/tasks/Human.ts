import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

export class Human extends WorkflowSystemTask {
  constructor() {
    super(TaskType.HUMAN);
  }

  override start(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    task.status = 'IN_PROGRESS';
  }

  override cancel(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    task.status = 'CANCELED';
  }
}
