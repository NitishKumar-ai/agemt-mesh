import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

export class Lambda extends WorkflowSystemTask {
  constructor() {
    super(TaskType.LAMBDA);
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const script = String(task.inputData['script'] ?? '');
    if (!script) {
      task.status = 'FAILED';
      task.reasonForIncompletion = 'No script defined';
      return true;
    }

    try {
      const keys = Object.keys(task.inputData);
      const vals = Object.values(task.inputData);
      const fn = new Function(...keys, `"use strict"; return (${script});`);
      const result = fn(...vals);
      task.outputData['result'] = result;
      task.status = 'COMPLETED';
    } catch (e) {
      task.status = 'FAILED_WITH_TERMINAL_ERROR';
      task.reasonForIncompletion = (e as Error).message;
    }
    return true;
  }
}
