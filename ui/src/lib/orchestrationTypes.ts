export interface WorkflowTask {
  name: string;
  taskReferenceName: string;
  type: string;
  description?: string;
  inputParameters?: Record<string, unknown>;
}

export interface WorkflowDef {
  name: string;
  version: number;
  description?: string;
  tasks: WorkflowTask[];
  ownerEmail?: string;
  timeoutPolicy?: string;
  timeoutSeconds?: number;
  restartable?: boolean;
  [key: string]: unknown;
}

export interface TaskDef {
  name: string;
  description?: string;
  ownerEmail?: string;
  retryCount?: number;
  timeoutPolicy?: string;
  timeoutSeconds?: number;
  responseTimeoutSeconds?: number;
  retryLogic?: string;
  retryDelaySeconds?: number;
  concurrentExecLimit?: number;
  rateLimitPerFrequency?: number;
  [key: string]: unknown;
}

export interface TaskExecution {
  taskId?: string;
  taskType?: string;
  referenceTaskName?: string;
  status?: string;
  startTime?: number;
  endTime?: number;
  [key: string]: unknown;
}

export interface WorkflowExecution {
  workflowId: string;
  workflowName?: string;
  workflowVersion?: number;
  status?: string;
  createTime?: number;
  endTime?: number;
  correlationId?: string;
  reasonForIncompletion?: string;
  tasks?: TaskExecution[];
  [key: string]: unknown;
}

export interface SearchResult<T> {
  totalHits: number;
  results: T[];
}

export interface EventHandler {
  name: string;
  event: string;
  condition?: string;
  actions: unknown[];
  active: boolean;
  evaluatorType?: string;
}

export interface Schedule {
  name: string;
  workflowName: string;
  workflowVersion: number;
  cronExpression: string;
  enabled: boolean;
  startTime?: number;
  endTime?: number;
  createdBy?: string;
  createTime: number;
  updatedTime: number;
}

export interface TaskQueueDetail {
  size: number;
  uacked: number;
}

export interface EventQueueDetail {
  queueName: string;
  size: number;
  unackedCount?: number;
}
