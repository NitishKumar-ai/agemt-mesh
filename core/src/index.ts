import { WorkflowDefSchema, type WorkflowDef } from '@agentmesh/common';

export function validateWorkflow(def: unknown): WorkflowDef {
  return WorkflowDefSchema.parse(def);
}

// Execution engine types
export type { TaskModel, WorkflowModel } from './execution/types.js';
export { createTaskModel, copyTaskModel, createWorkflowModel } from './execution/types.js';

// Execution engine core
export { WorkflowSystemTask } from './execution/WorkflowSystemTask.js';
export { SystemTaskRegistry } from './execution/SystemTaskRegistry.js';
export { SystemTaskWorker } from './execution/SystemTaskWorker.js';
export {
  DeciderService,
  DeciderOutcome,
  TerminateWorkflowError,
} from './execution/DeciderService.js';
export { WorkflowExecutorOps } from './execution/WorkflowExecutorOps.js';
export { WorkflowSweeper } from './execution/WorkflowSweeper.js';
export type { SweeperProperties } from './execution/WorkflowSweeper.js';
export type {
  WorkflowExecutor,
  StartWorkflowInput,
  TaskResult,
} from './execution/WorkflowExecutor.js';
export type {
  QueueDAO,
  ExecutionDAOFacade,
  MetadataMapperService,
  WorkflowStatusListener,
  TaskStatusListener,
  ExecutionLockService,
  AgentMeshProperties,
} from './execution/WorkflowExecutorOps.js';
export {
  DECIDER_QUEUE,
  removeIterationFromTaskRefName,
  appendIteration,
  hasInProgressHumanTask,
  getQueueName,
  computePostpone,
  getTaskByRefName,
  getNextTask,
  workflowTaskHas,
  workflowTaskNext,
} from './execution/ExecutorUtils.js';

// System tasks
export { Decision } from './execution/tasks/Decision.js';
export { DoWhile } from './execution/tasks/DoWhile.js';
export { Event } from './execution/tasks/Event.js';
export { ExclusiveJoin } from './execution/tasks/ExclusiveJoin.js';
export { Fork } from './execution/tasks/Fork.js';
export { Human } from './execution/tasks/Human.js';
export { Inline } from './execution/tasks/Inline.js';
export { Join } from './execution/tasks/Join.js';
export { Lambda } from './execution/tasks/Lambda.js';
export { Noop } from './execution/tasks/Noop.js';
export { SetVariable } from './execution/tasks/SetVariable.js';
export { StartWorkflow } from './execution/tasks/StartWorkflow.js';
export { SubWorkflow } from './execution/tasks/SubWorkflow.js';
export { Switch } from './execution/tasks/Switch.js';
export {
  Terminate,
  TERMINATION_STATUS_PARAMETER,
  TERMINATION_REASON_PARAMETER,
  TERMINATION_WORKFLOW_OUTPUT,
  getTerminationStatusParameter,
  getTerminationReasonParameter,
  getTerminationWorkflowOutputParameter,
  validateInputStatus,
} from './execution/tasks/Terminate.js';
export { Wait } from './execution/tasks/Wait.js';

// Task mappers
export type { TaskMapper } from './execution/mappers/TaskMapper.js';
export { TaskMapperContext } from './execution/mappers/TaskMapperContext.js';
export { DoWhileTaskMapper } from './execution/mappers/DoWhileTaskMapper.js';
export { ForkJoinDynamicTaskMapper } from './execution/mappers/ForkJoinDynamicTaskMapper.js';
export { ForkJoinTaskMapper } from './execution/mappers/ForkJoinTaskMapper.js';
export { HumanTaskMapper } from './execution/mappers/HumanTaskMapper.js';
export { JoinTaskMapper } from './execution/mappers/JoinTaskMapper.js';
export { SimpleTaskMapper } from './execution/mappers/SimpleTaskMapper.js';
export { SubWorkflowTaskMapper } from './execution/mappers/SubWorkflowTaskMapper.js';
export { SwitchTaskMapper } from './execution/mappers/SwitchTaskMapper.js';
export { TerminateTaskMapper } from './execution/mappers/TerminateTaskMapper.js';
export { WaitTaskMapper } from './execution/mappers/WaitTaskMapper.js';
export { UserDefinedTaskMapper } from './execution/mappers/UserDefinedTaskMapper.js';
