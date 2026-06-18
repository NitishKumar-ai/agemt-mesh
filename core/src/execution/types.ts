import type {
  TaskStatus,
  WorkflowStatus,
  TaskType,
  TaskDef,
  WorkflowTask,
  WorkflowDef,
} from '@conductor/common';

export interface TaskModel {
  taskId: string;
  taskType: string;
  taskDefName: string;
  referenceTaskName: string;
  status: TaskStatus;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  workflowInstanceId: string;
  workflowType: string;
  retryCount: number;
  retriedTaskId: string | null;
  seq: number;
  startTime: number;
  endTime: number;
  scheduledTime: number;
  updateTime: number;
  firstScheduledTime: number;
  callbackAfterSeconds: number;
  callbackAfterMs: number;
  pollCount: number;
  workerId: string | null;
  reasonForIncompletion: string | null;
  subWorkflowId: string | null;
  externalOutputPayloadStoragePath: string | null;
  externalInputPayloadStoragePath: string | null;
  workflowTask: WorkflowTask | null;
  iteration: number;
  executed: boolean;
  retried: boolean;
  domain: string | null;
  workflowPriority: number;
  correlationId: string | null;
  parentTaskReferenceName: string | null;
  isolationGroupId: string | null;
  outputMessage: string | null;
  inputMessage: string | null;
  waitTimeout: number;
  startDelayInSeconds: number;
  subworkflowChanged: boolean;
  loopOverTask: boolean;
  taskDefinition: TaskDef | null;
}

export function createTaskModel(overrides?: Partial<TaskModel>): TaskModel {
  return {
    taskId: '',
    taskType: '',
    taskDefName: '',
    referenceTaskName: '',
    status: 'SCHEDULED',
    inputData: {},
    outputData: {},
    workflowInstanceId: '',
    workflowType: '',
    retryCount: 0,
    retriedTaskId: null,
    seq: 0,
    startTime: 0,
    endTime: 0,
    scheduledTime: 0,
    updateTime: 0,
    firstScheduledTime: 0,
    callbackAfterSeconds: 0,
    callbackAfterMs: 0,
    pollCount: 0,
    workerId: null,
    reasonForIncompletion: null,
    subWorkflowId: null,
    externalOutputPayloadStoragePath: null,
    externalInputPayloadStoragePath: null,
    workflowTask: null,
    iteration: 0,
    executed: false,
    retried: false,
    domain: null,
    workflowPriority: 0,
    correlationId: null,
    parentTaskReferenceName: null,
    isolationGroupId: null,
    outputMessage: null,
    inputMessage: null,
    waitTimeout: 0,
    startDelayInSeconds: 0,
    subworkflowChanged: false,
    loopOverTask: false,
    taskDefinition: null,
    ...overrides,
  };
}

export function copyTaskModel(task: TaskModel): TaskModel {
  return {
    ...task,
    inputData: { ...task.inputData },
    outputData: { ...task.outputData },
  };
}

export interface WorkflowModel {
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: WorkflowStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  tasks: TaskModel[];
  workflowDefinition: WorkflowDef | null;
  createTime: number;
  endTime: number;
  startTime: number;
  correlationId: string | null;
  priority: number;
  parentWorkflowId: string | null;
  parentWorkflowTaskId: string | null;
  reasonForIncompletion: string | null;
  failedTaskId: string | null;
  failedReferenceTaskNames: Set<string>;
  failedTaskNames: Set<string>;
  variables: Record<string, unknown>;
  taskToDomain: Record<string, string> | null;
  lastRetriedTime: number;
  ownerApp: string;
  event: string | null;
  reRunFromWorkflowId: string | null;
  externalOutputPayloadStoragePath: string | null;
}

export function createWorkflowModel(overrides?: Partial<WorkflowModel>): WorkflowModel {
  return {
    workflowId: '',
    workflowName: '',
    workflowVersion: 1,
    status: 'RUNNING',
    input: {},
    output: {},
    tasks: [],
    workflowDefinition: null,
    createTime: Date.now(),
    endTime: 0,
    startTime: 0,
    correlationId: null,
    priority: 0,
    parentWorkflowId: null,
    parentWorkflowTaskId: null,
    reasonForIncompletion: null,
    failedTaskId: null,
    failedReferenceTaskNames: new Set(),
    failedTaskNames: new Set(),
    variables: {},
    taskToDomain: null,
    lastRetriedTime: 0,
    ownerApp: '',
    event: null,
    reRunFromWorkflowId: null,
    externalOutputPayloadStoragePath: null,
    ...overrides,
  };
}
