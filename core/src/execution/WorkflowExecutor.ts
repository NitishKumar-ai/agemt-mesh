import type { TaskModel, WorkflowModel } from './types.js';

export interface StartWorkflowInput {
  name?: string;
  version?: number;
  workflowInput?: Record<string, unknown>;
  correlationId?: string;
  parentWorkflowId?: string;
  parentWorkflowTaskId?: string;
  taskToDomain?: Record<string, string>;
  workflowId?: string;
  priority?: number;
  workflowDefinition?: Record<string, unknown> | null;
  triggeringWorkflowId?: string;
  event?: string;
}

export interface WorkflowExecutor {
  resetCallbacksForWorkflow(workflowId: string): void;

  rerun(request: {
    reRunFromWorkflowId: string;
    reRunFromTaskId?: string;
    taskInput?: Record<string, unknown>;
    workflowInput?: Record<string, unknown>;
    correlationId?: string;
  }): string;

  restart(workflowId: string, useLatestDefinitions: boolean): void;

  retry(workflowId: string, resumeSubworkflowTasks: boolean): void;

  updateTask(taskResult: TaskResult): TaskModel | null;

  getTask(taskId: string): TaskModel | null;

  getRunningWorkflows(workflowName: string, version: number): WorkflowModel[];

  getWorkflows(name: string, version: number, startTime: number, endTime: number): string[];

  getRunningWorkflowIds(workflowName: string, version: number): string[];

  decide(workflowId: string): WorkflowModel | null;

  decideWithLock(workflow: WorkflowModel): WorkflowModel | null;

  terminateWorkflow(workflowId: string, reason: string): void;

  terminateWorkflowWithFailure(
    workflow: WorkflowModel,
    reason: string,
    failureWorkflow: string | null,
  ): WorkflowModel;

  pauseWorkflow(workflowId: string): void;

  resumeWorkflow(workflowId: string): void;

  skipTaskFromWorkflow(
    workflowId: string,
    taskReferenceName: string,
    skipTaskRequest?: { taskInput?: Record<string, unknown>; taskOutput?: Record<string, unknown> },
  ): void;

  getWorkflow(workflowId: string, includeTasks: boolean): WorkflowModel | null;

  scheduleNextIteration(task: TaskModel, workflow: WorkflowModel): void;

  startWorkflow(input: StartWorkflowInput): string;

  startWorkflowIdempotent(input: StartWorkflowInput): WorkflowModel;
}

export interface TaskResult {
  taskId: string;
  workflowInstanceId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'FAILED_WITH_TERMINAL_ERROR' | 'CANCELED' | 'TIMED_OUT' | 'SCHEDULED';
  outputData: Record<string, unknown>;
  outputMessage?: string;
  reasonForIncompletion?: string;
  workerId?: string;
  callbackAfterSeconds: number;
  subWorkflowId?: string;
  externalOutputPayloadStoragePath?: string;
  logs?: Array<{ log: string; createdTime?: number }>;
  extendLease?: boolean;
}
