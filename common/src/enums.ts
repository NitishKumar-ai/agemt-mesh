/**
 * Core enumerations ported from `com.agentmesh.agentmesh.common.metadata`.
 *
 * Modeled as const-object + union type (not TS `enum`) so values serialize to
 * the exact strings Java emits via `.name()`, preserving JSON wire parity.
 */

/** Port of `metadata.tasks.TaskType`. */
export const TaskType = {
  SIMPLE: 'SIMPLE',
  DYNAMIC: 'DYNAMIC',
  FORK_JOIN: 'FORK_JOIN',
  FORK_JOIN_DYNAMIC: 'FORK_JOIN_DYNAMIC',
  DECISION: 'DECISION',
  SWITCH: 'SWITCH',
  JOIN: 'JOIN',
  DO_WHILE: 'DO_WHILE',
  SUB_WORKFLOW: 'SUB_WORKFLOW',
  START_WORKFLOW: 'START_WORKFLOW',
  EVENT: 'EVENT',
  WAIT: 'WAIT',
  HUMAN: 'HUMAN',
  USER_DEFINED: 'USER_DEFINED',
  HTTP: 'HTTP',
  LAMBDA: 'LAMBDA',
  INLINE: 'INLINE',
  EXCLUSIVE_JOIN: 'EXCLUSIVE_JOIN',
  TERMINATE: 'TERMINATE',
  KAFKA_PUBLISH: 'KAFKA_PUBLISH',
  JSON_JQ_TRANSFORM: 'JSON_JQ_TRANSFORM',
  SET_VARIABLE: 'SET_VARIABLE',
  NOOP: 'NOOP',
  LLM_TEXT_COMPLETE: 'LLM_TEXT_COMPLETE',
  LLM_CHAT_COMPLETE: 'LLM_CHAT_COMPLETE',
  LLM_INDEX_TEXT: 'LLM_INDEX_TEXT',
  LLM_SEARCH_INDEX: 'LLM_SEARCH_INDEX',
  LLM_GENERATE_EMBEDDINGS: 'LLM_GENERATE_EMBEDDINGS',
  LLM_STORE_EMBEDDINGS: 'LLM_STORE_EMBEDDINGS',
  LLM_GET_EMBEDDINGS: 'LLM_GET_EMBEDDINGS',
  LIST_MCP_TOOLS: 'LIST_MCP_TOOLS',
  CALL_MCP_TOOL: 'CALL_MCP_TOOL',
  PULL_WORKFLOW_MESSAGES: 'PULL_WORKFLOW_MESSAGES',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

/**
 * Built-in (system) task types. `FORK` is the legacy alias used in workflow
 * defs for `FORK_JOIN`; mirrors `TaskType.BUILT_IN_TASKS`.
 */
export const BUILT_IN_TASKS: ReadonlySet<string> = new Set<string>([
  TaskType.DECISION,
  TaskType.SWITCH,
  'FORK',
  TaskType.JOIN,
  TaskType.EXCLUSIVE_JOIN,
  TaskType.DO_WHILE,
  TaskType.FORK_JOIN_DYNAMIC,
  TaskType.EVENT,
  TaskType.WAIT,
  TaskType.HUMAN,
  TaskType.SUB_WORKFLOW,
  TaskType.START_WORKFLOW,
  TaskType.FORK_JOIN,
  TaskType.TERMINATE,
  TaskType.KAFKA_PUBLISH,
  TaskType.JSON_JQ_TRANSFORM,
  TaskType.SET_VARIABLE,
  TaskType.NOOP,
  TaskType.PULL_WORKFLOW_MESSAGES,
]);

export function isBuiltInTask(type: string): boolean {
  return BUILT_IN_TASKS.has(type);
}

/** Port of `metadata.tasks.Task.Status`. */
export const TaskStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
  FAILED_WITH_TERMINAL_ERROR: 'FAILED_WITH_TERMINAL_ERROR',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
  SCHEDULED: 'SCHEDULED',
  TIMED_OUT: 'TIMED_OUT',
  SKIPPED: 'SKIPPED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

interface StatusFlags {
  readonly terminal: boolean;
  readonly successful: boolean;
  readonly retriable: boolean;
}

/** (terminal, successful, retriable) flags, faithful to the Java enum ctor. */
const TASK_STATUS_FLAGS: Record<TaskStatus, StatusFlags> = {
  IN_PROGRESS: { terminal: false, successful: true, retriable: true },
  CANCELED: { terminal: true, successful: false, retriable: false },
  FAILED: { terminal: true, successful: false, retriable: true },
  FAILED_WITH_TERMINAL_ERROR: { terminal: true, successful: false, retriable: false },
  COMPLETED: { terminal: true, successful: true, retriable: true },
  COMPLETED_WITH_ERRORS: { terminal: true, successful: true, retriable: true },
  SCHEDULED: { terminal: false, successful: true, retriable: true },
  TIMED_OUT: { terminal: true, successful: false, retriable: true },
  SKIPPED: { terminal: true, successful: true, retriable: false },
};

export const isTaskTerminal = (s: TaskStatus): boolean => TASK_STATUS_FLAGS[s].terminal;
export const isTaskSuccessful = (s: TaskStatus): boolean => TASK_STATUS_FLAGS[s].successful;
export const isTaskRetriable = (s: TaskStatus): boolean => TASK_STATUS_FLAGS[s].retriable;

/** Port of `run.Workflow.WorkflowStatus`. */
export const WorkflowStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  TERMINATED: 'TERMINATED',
  PAUSED: 'PAUSED',
} as const;
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

const WORKFLOW_STATUS_FLAGS: Record<WorkflowStatus, Omit<StatusFlags, 'retriable'>> = {
  RUNNING: { terminal: false, successful: false },
  COMPLETED: { terminal: true, successful: true },
  FAILED: { terminal: true, successful: false },
  TIMED_OUT: { terminal: true, successful: false },
  TERMINATED: { terminal: true, successful: false },
  PAUSED: { terminal: false, successful: true },
};

export const isWorkflowTerminal = (s: WorkflowStatus): boolean => WORKFLOW_STATUS_FLAGS[s].terminal;
export const isWorkflowSuccessful = (s: WorkflowStatus): boolean =>
  WORKFLOW_STATUS_FLAGS[s].successful;

/** Port of `metadata.tasks.TaskDef.TimeoutPolicy`. */
export const TaskTimeoutPolicy = {
  RETRY: 'RETRY',
  TIME_OUT_WF: 'TIME_OUT_WF',
  ALERT_ONLY: 'ALERT_ONLY',
} as const;
export type TaskTimeoutPolicy = (typeof TaskTimeoutPolicy)[keyof typeof TaskTimeoutPolicy];

/** Port of `metadata.tasks.TaskDef.RetryLogic`. */
export const RetryLogic = {
  FIXED: 'FIXED',
  EXPONENTIAL_BACKOFF: 'EXPONENTIAL_BACKOFF',
  LINEAR_BACKOFF: 'LINEAR_BACKOFF',
} as const;
export type RetryLogic = (typeof RetryLogic)[keyof typeof RetryLogic];

/** Port of `metadata.workflow.WorkflowDef.TimeoutPolicy` (no RETRY option). */
export const WorkflowTimeoutPolicy = {
  TIME_OUT_WF: 'TIME_OUT_WF',
  ALERT_ONLY: 'ALERT_ONLY',
} as const;
export type WorkflowTimeoutPolicy =
  (typeof WorkflowTimeoutPolicy)[keyof typeof WorkflowTimeoutPolicy];

/** Port of `metadata.workflow.IdempotencyStrategy`. */
export const IdempotencyStrategy = {
  FAIL: 'FAIL',
  RETURN_EXISTING: 'RETURN_EXISTING',
  FAIL_ON_RUNNING: 'FAIL_ON_RUNNING',
} as const;
export type IdempotencyStrategy = (typeof IdempotencyStrategy)[keyof typeof IdempotencyStrategy];

/** Port of `metadata.workflow.WorkflowTask.JoinMode` (Java values: SYNC, ASYNC). */
export const JoinMode = {
  SYNC: 'SYNC',
  ASYNC: 'ASYNC',
} as const;
export type JoinMode = (typeof JoinMode)[keyof typeof JoinMode];

/** Port of `metadata.workflow.RateLimitConfig.RateLimitPolicy`. */
export const RateLimitPolicy = {
  QUEUE: 'QUEUE',
  REJECT: 'REJECT',
} as const;
export type RateLimitPolicy = (typeof RateLimitPolicy)[keyof typeof RateLimitPolicy];

/** Port of `org.agentmeshoss.agentmesh.model.WorkflowSignalReturnStrategy`. */
export const WorkflowSignalReturnStrategy = {
  TARGET_WORKFLOW: 'TARGET_WORKFLOW',
  BLOCKING_WORKFLOW: 'BLOCKING_WORKFLOW',
  BLOCKING_TASK: 'BLOCKING_TASK',
  BLOCKING_TASK_INPUT: 'BLOCKING_TASK_INPUT',
} as const;
export type WorkflowSignalReturnStrategy =
  (typeof WorkflowSignalReturnStrategy)[keyof typeof WorkflowSignalReturnStrategy];

/** Port of `metadata.events.EventExecution.Status`. */
export const EventExecutionStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type EventExecutionStatus = (typeof EventExecutionStatus)[keyof typeof EventExecutionStatus];

/** Port of `metadata.events.EventHandler.Action.Type`. */
export const EventActionType = {
  START_WORKFLOW: 'start_workflow',
  COMPLETE_TASK: 'complete_task',
  FAIL_TASK: 'fail_task',
  TERMINATE_WORKFLOW: 'terminate_workflow',
  UPDATE_WORKFLOW_VARIABLES: 'update_workflow_variables',
} as const;
export type EventActionType = (typeof EventActionType)[keyof typeof EventActionType];
