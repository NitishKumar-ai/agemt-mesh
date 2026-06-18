import type { WorkflowModel, TaskModel } from './types.js';
import type { WorkflowExecutor } from './WorkflowExecutor.js';

export abstract class WorkflowSystemTask {
  readonly taskType: string;

  constructor(taskType: string) {
    this.taskType = taskType;
  }

  start(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
  }

  execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    return false;
  }

  cancel(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
  }

  getEvaluationOffset(taskModel: TaskModel, maxOffset: number): number | undefined {
    return undefined;
  }

  isAsync(): boolean {
    return false;
  }

  isAsyncComplete(task: TaskModel): boolean {
    if (task.inputData['asyncComplete'] !== undefined) {
      return Boolean(task.inputData['asyncComplete']);
    }
    return task.workflowTask?.asyncComplete ?? false;
  }

  isTaskRetrievalRequired(): boolean {
    return true;
  }

  toString(): string {
    return this.taskType;
  }
}
