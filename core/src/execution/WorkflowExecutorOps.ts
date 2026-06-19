import type {
  TaskDef,
  WorkflowDef,
  WorkflowTask,
  TaskStatus,
  WorkflowStatus,
} from '@agentmesh/common';
import {
  isTaskTerminal,
  isTaskSuccessful,
  isWorkflowTerminal,
  isWorkflowSuccessful,
  isBuiltInTask,
  TaskType,
  NotFoundException,
  ConflictException,
} from '@agentmesh/common';
import type { WorkflowExecutor, StartWorkflowInput, TaskResult } from './WorkflowExecutor.js';
import type { TaskModel, WorkflowModel } from './types.js';
import { createTaskModel, copyTaskModel, createWorkflowModel } from './types.js';
import { DeciderService, DeciderOutcome, TerminateWorkflowError } from './DeciderService.js';
import type { SystemTaskRegistry } from './SystemTaskRegistry.js';
import { WorkflowSystemTask } from './WorkflowSystemTask.js';
import {
  Terminate,
  TERMINATION_STATUS_PARAMETER,
  TERMINATION_REASON_PARAMETER,
} from './tasks/Terminate.js';
import { DECIDER_QUEUE, hasInProgressHumanTask, getTaskByRefName } from './ExecutorUtils.js';

export type QueueDAO = {
  push(queueName: string, id: string, priority: number, delaySeconds: number): void;
  pushDuration(queueName: string, id: string, priority: number, delay: { seconds: number }): void;
  remove(queueName: string, id: string): void;
  postpone(queueName: string, id: string, priority: number, delaySeconds: number): void;
  setUnackTimeout(queueName: string, id: string, timeoutMs: number): void;
  containsMessage(queueName: string, id: string): boolean;
  resetOffsetTime(queueName: string, id: string): boolean;
  pop(queueName: string, count: number, timeout: number): Promise<string[]> | string[];
};

export type ExecutionDAOFacade = {
  getWorkflowModel(workflowId: string, includeTasks: boolean): WorkflowModel | null;
  getTaskModel(taskId: string): TaskModel | null;
  createWorkflow(workflow: WorkflowModel): void;
  updateWorkflow(workflow: WorkflowModel): void;
  updateTask(task: TaskModel): void;
  updateTasks(tasks: TaskModel[]): void;
  createTasks(tasks: TaskModel[]): void;
  removeTask(taskId: string): void;
  removeWorkflow(workflowId: string, removeFromIndex: boolean): void;
  resetWorkflow(workflowId: string): void;
  populateTaskData(task: TaskModel): void;
  populateWorkflowAndTaskPayloadData(workflow: WorkflowModel): void;
  addTaskExecLog(logs: Array<{ log: string; taskId?: string; createdTime?: number }>): void;
  extendLease(task: TaskModel): void;
  removeFromPendingWorkflow(workflowName: string, workflowId: string): void;
  getTaskPollDataByDomain(
    taskType: string,
    domain: string,
  ): { domain: string; lastPollTime: number } | null;
  getPendingWorkflowsByName(workflowName: string, version: number): WorkflowModel[];
  getWorkflowsByName(name: string, startTime: number, endTime: number): WorkflowModel[];
  getRunningWorkflowIds(workflowName: string, version: number): string[];
  getWorkflowModelFromExecutionDAO(workflowId: string, includeTasks: boolean): WorkflowModel;
};

export type MetadataMapperService = {
  populateTaskDefinitions(workflowDef: WorkflowDef): WorkflowDef;
  populateWorkflowWithDefinitions(workflow: WorkflowModel): void;
  populateTaskWithDefinition(task: TaskModel): TaskModel;
  lookupForWorkflowDefinition(name: string, version?: number): WorkflowDef;
};

export type WorkflowStatusListener = {
  onWorkflowStartedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowCompletedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowTerminatedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowFinalizedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowPausedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowResumedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowRestartedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowRetriedIfEnabled(workflow: WorkflowModel): void;
  onWorkflowRerunIfEnabled(workflow: WorkflowModel): void;
};

export type TaskStatusListener = {
  onTaskCompletedIfEnabled(task: TaskModel): void;
  onTaskCanceledIfEnabled(task: TaskModel): void;
  onTaskFailedIfEnabled(task: TaskModel): void;
  onTaskFailedWithTerminalErrorIfEnabled(task: TaskModel): void;
  onTaskTimedOutIfEnabled(task: TaskModel): void;
  onTaskInProgressIfEnabled(task: TaskModel): void;
  onTaskScheduledIfEnabled(task: TaskModel): void;
};

export type ExecutionLockService = {
  acquireLock(workflowId: string): boolean;
  acquireLockWithLease(workflowId: string, leaseTimeMs: number): boolean;
  releaseLock(workflowId: string): void;
  deleteLock(workflowId: string): void;
};

export interface AgentMeshProperties {
  activeWorkerLastPollTimeout: number;
  workflowOffsetTimeout: number;
  lockLeaseTime: number;
  humanTaskPreventsDeciderQueue: boolean;
  maxPostponeDurationSeconds: number;
  systemTaskPostponeThreshold: number;
}

const EXPEDITED_PRIORITY = 10;

export class WorkflowExecutorOps implements WorkflowExecutor {
  private deciderService: DeciderService;
  private queueDAO: QueueDAO;
  private executionDAOFacade: ExecutionDAOFacade;
  private properties: AgentMeshProperties;
  private metadataMapperService: MetadataMapperService;
  private workflowStatusListener: WorkflowStatusListener;
  private taskStatusListener: TaskStatusListener;
  private systemTaskRegistry: SystemTaskRegistry;
  private executionLockService: ExecutionLockService;
  private activeWorkerLastPollMs: number;

  constructor(params: {
    deciderService: DeciderService;
    queueDAO: QueueDAO;
    executionDAOFacade: ExecutionDAOFacade;
    properties: AgentMeshProperties;
    metadataMapperService: MetadataMapperService;
    workflowStatusListener: WorkflowStatusListener;
    taskStatusListener: TaskStatusListener;
    systemTaskRegistry: SystemTaskRegistry;
    executionLockService: ExecutionLockService;
  }) {
    this.deciderService = params.deciderService;
    this.queueDAO = params.queueDAO;
    this.executionDAOFacade = params.executionDAOFacade;
    this.properties = params.properties;
    this.metadataMapperService = params.metadataMapperService;
    this.workflowStatusListener = params.workflowStatusListener;
    this.taskStatusListener = params.taskStatusListener;
    this.systemTaskRegistry = params.systemTaskRegistry;
    this.executionLockService = params.executionLockService;
    this.activeWorkerLastPollMs = params.properties.activeWorkerLastPollTimeout;
  }

  resetCallbacksForWorkflow(workflowId: string): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) return;

    if (isWorkflowTerminal(workflow.status)) {
      throw new Error(`Workflow is in terminal state. Status = ${workflow.status}`);
    }

    for (const task of workflow.tasks) {
      if (
        !this.systemTaskRegistry.isSystemTask(task.taskType) &&
        task.status === 'SCHEDULED' &&
        task.callbackAfterSeconds > 0
      ) {
        if (this.queueDAO.resetOffsetTime(task.taskDefName || task.taskType, task.taskId)) {
          task.callbackAfterSeconds = 0;
          this.executionDAOFacade.updateTask(task);
        }
      }
    }
  }

  rerun(request: {
    reRunFromWorkflowId: string;
    reRunFromTaskId?: string;
    taskInput?: Record<string, unknown>;
    workflowInput?: Record<string, unknown>;
    correlationId?: string;
  }): string {
    const result = this.rerunWF(
      request.reRunFromWorkflowId,
      request.reRunFromTaskId,
      request.taskInput,
      request.workflowInput,
      request.correlationId,
    );
    if (!result) {
      throw new Error(`Task ${request.reRunFromTaskId} not found`);
    }
    return request.reRunFromWorkflowId;
  }

  restart(workflowId: string, useLatestDefinitions: boolean): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    if (!isWorkflowTerminal(workflow.status)) {
      throw new Error(`Workflow: ${workflowId} is not in terminal state, unable to restart.`);
    }

    this.executionDAOFacade.resetWorkflow(workflowId);

    workflow.tasks = [];
    workflow.reasonForIncompletion = null;
    workflow.failedTaskId = null;
    workflow.createTime = Date.now();
    workflow.endTime = 0;
    workflow.lastRetriedTime = 0;
    workflow.status = 'RUNNING';
    workflow.output = {};
    workflow.externalOutputPayloadStoragePath = null;

    try {
      this.executionDAOFacade.createWorkflow(workflow);
      this.notifyWorkflowStatusListener(workflow, 'RESTARTED');
    } catch (e) {
      this.terminateWorkflow(workflowId, `Error when restarting the workflow`);
      throw e;
    }

    this.decide(workflowId);
    this.updateAndPushParents(workflow, 'restarted');
  }

  retry(workflowId: string, resumeSubworkflowTasks: boolean): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);

    if (!isWorkflowTerminal(workflow.status)) {
      throw new ConflictException(`Workflow is still running. status=${workflow.status}`);
    }
    if (workflow.tasks.length === 0) {
      throw new ConflictException('Workflow has not started yet');
    }

    if (resumeSubworkflowTasks) {
      const taskToRetry = workflow.tasks.find(
        (t) => isTaskTerminal(t.status) && !isTaskSuccessful(t.status),
      );
      if (taskToRetry) {
        const lastFailedSubWorkflow = this.findLastFailedSubWorkflowIfAny(taskToRetry, workflow);
        this.retryInternal(lastFailedSubWorkflow);
        this.updateAndPushParents(lastFailedSubWorkflow, 'retried');
      }
    } else {
      this.retryInternal(workflow);
      this.updateAndPushParents(workflow, 'retried');
    }
  }

  private updateAndPushParents(workflow: WorkflowModel, operation: string): void {
    while (workflow.parentWorkflowId && workflow.parentWorkflowTaskId) {
      const subWorkflowTask = this.executionDAOFacade.getTaskModel(workflow.parentWorkflowTaskId);
      if (!subWorkflowTask || !subWorkflowTask.workflowTask) break;

      if (subWorkflowTask.workflowTask.optional) break;

      subWorkflowTask.subworkflowChanged = true;
      subWorkflowTask.status = 'IN_PROGRESS';
      this.executionDAOFacade.updateTask(subWorkflowTask);

      const parentWorkflowId = workflow.parentWorkflowId;
      const parentWorkflow = this.executionDAOFacade.getWorkflowModel(parentWorkflowId, true);
      if (!parentWorkflow) break;

      parentWorkflow.status = 'RUNNING';
      parentWorkflow.reasonForIncompletion = null;
      parentWorkflow.failedTaskId = null;
      parentWorkflow.failedReferenceTaskNames = new Set();
      parentWorkflow.failedTaskNames = new Set();
      parentWorkflow.lastRetriedTime = Date.now();
      this.executionDAOFacade.updateWorkflow(parentWorkflow);

      try {
        const eventType = operation.toUpperCase();
        this.notifyWorkflowStatusListener(parentWorkflow, eventType);
      } catch {
        // ignore unknown operation type
      }

      this.expediteLazyWorkflowEvaluation(parentWorkflowId);
      workflow = parentWorkflow;
    }
  }

  private findLastFailedSubWorkflowIfAny(
    task: TaskModel,
    parentWorkflow: WorkflowModel,
  ): WorkflowModel {
    if (
      task.taskType === 'SUB_WORKFLOW' &&
      isTaskTerminal(task.status) &&
      !isTaskSuccessful(task.status)
    ) {
      const subWorkflow = this.executionDAOFacade.getWorkflowModel(task.subWorkflowId ?? '', true);
      if (subWorkflow) {
        const taskToRetry = subWorkflow.tasks.find(
          (t) => isTaskTerminal(t.status) && !isTaskSuccessful(t.status),
        );
        if (taskToRetry) {
          return this.findLastFailedSubWorkflowIfAny(taskToRetry, subWorkflow);
        }
      }
    }
    return parentWorkflow;
  }

  private resetUnsuccessfulJoinTasks(workflow: WorkflowModel): void {
    const hasJoin = workflow.tasks.some(
      (t) => t.taskType === 'JOIN' || t.taskType === 'FORK_JOIN_DYNAMIC',
    );
    if (!hasJoin) return;

    for (const task of workflow.tasks) {
      if (
        (task.taskType === 'JOIN' || task.taskType === 'EXCLUSIVE_JOIN') &&
        isTaskTerminal(task.status) &&
        !isTaskSuccessful(task.status)
      ) {
        task.status = 'IN_PROGRESS';
        this.addTaskToQueue(task);
        this.executionDAOFacade.updateTask(task);
      }
    }
  }

  private retryInternal(workflow: WorkflowModel): void {
    const retriableMap = new Map<string, TaskModel>();

    for (const task of workflow.tasks) {
      switch (task.status) {
        case 'FAILED':
          if (task.taskType === 'JOIN' || task.taskType === 'EXCLUSIVE_JOIN') {
            const joinOn = task.inputData['joinOn'] as string[] | undefined;
            if (joinOn && this.isJoinOnFailedPermissive(joinOn, workflow)) {
              task.status = 'IN_PROGRESS';
              this.addTaskToQueue(task);
              break;
            }
          }
        // falls through
        case 'FAILED_WITH_TERMINAL_ERROR':
        case 'TIMED_OUT':
          retriableMap.set(task.referenceTaskName, task);
          break;
        case 'CANCELED':
          if (task.taskType === 'JOIN' || task.taskType === 'DO_WHILE') {
            task.status = 'IN_PROGRESS';
            this.addTaskToQueue(task);
          } else {
            retriableMap.set(task.referenceTaskName, task);
          }
          break;
        default:
          retriableMap.delete(task.referenceTaskName);
          break;
      }
    }

    if (retriableMap.size === 0 && workflow.status !== 'TIMED_OUT') {
      throw new Error(
        'There are no retryable tasks! Use restart if you want to attempt entire workflow execution again.',
      );
    }

    workflow.status = 'RUNNING';
    workflow.lastRetriedTime = Date.now();
    workflow.reasonForIncompletion = null;

    this.queueDAO.push(
      DECIDER_QUEUE,
      workflow.workflowId,
      workflow.priority,
      this.properties.workflowOffsetTimeout,
    );
    this.executionDAOFacade.updateWorkflow(workflow);
    this.notifyWorkflowStatusListener(workflow, 'RETRIED');

    const retriableTasks = Array.from(retriableMap.values())
      .sort((a, b) => a.seq - b.seq)
      .map((task) => this.taskToBeRescheduled(workflow, task));

    this.dedupAndAddTasks(workflow, retriableTasks);
    this.executionDAOFacade.updateTasks(workflow.tasks);
    this.scheduleTask(workflow, retriableTasks);
  }

  private taskToBeRescheduled(workflow: WorkflowModel, task: TaskModel): TaskModel {
    const taskToBeRetried = copyTaskModel(task);
    taskToBeRetried.taskId = generateId();
    taskToBeRetried.retriedTaskId = task.taskId;
    taskToBeRetried.status = 'SCHEDULED';
    taskToBeRetried.retryCount = task.retryCount + 1;
    taskToBeRetried.retried = false;
    taskToBeRetried.pollCount = 0;
    taskToBeRetried.callbackAfterSeconds = 0;
    taskToBeRetried.subWorkflowId = null;
    taskToBeRetried.scheduledTime = 0;
    taskToBeRetried.startTime = 0;
    taskToBeRetried.endTime = 0;
    taskToBeRetried.workerId = null;
    taskToBeRetried.reasonForIncompletion = null;
    taskToBeRetried.seq = 0;
    this.clearRetriedTaskRuntimeState(taskToBeRetried);

    task.retried = true;
    task.executed = true;

    return taskToBeRetried;
  }

  private clearRetriedTaskRuntimeState(task: TaskModel): void {
    task.updateTime = 0;
    task.callbackAfterMs = 0;
    task.outputData = {};
    task.externalOutputPayloadStoragePath = null;
    task.outputMessage = null;
  }

  private endExecution(workflow: WorkflowModel, terminateTask: TaskModel | null): void {
    let raiseFinalizedNotification = false;

    if (terminateTask) {
      const terminationStatus = terminateTask.inputData[TERMINATION_STATUS_PARAMETER] as
        | string
        | undefined;
      let reason = terminateTask.inputData[TERMINATION_REASON_PARAMETER] as string | undefined;
      if (!reason) {
        reason = `Workflow is ${terminationStatus} by TERMINATE task: ${terminateTask.taskId}`;
      }

      if (terminationStatus === 'FAILED') {
        workflow.status = 'FAILED';
        this.terminate(workflow, new TerminateWorkflowError(reason, 'FAILED', terminateTask));
      } else if (terminationStatus === 'TERMINATED') {
        workflow.status = 'TERMINATED';
        this.terminate(workflow, new TerminateWorkflowError(reason, 'TERMINATED', terminateTask));
      } else {
        workflow.reasonForIncompletion = reason;
        this.completeWorkflow(workflow);
        raiseFinalizedNotification = true;
      }
    } else {
      this.completeWorkflow(workflow);
      raiseFinalizedNotification = true;
    }

    this.cancelNonTerminalTasks(workflow, raiseFinalizedNotification);
  }

  private completeWorkflow(workflow: WorkflowModel): void {
    if (workflow.status === 'COMPLETED') {
      this.queueDAO.remove(DECIDER_QUEUE, workflow.workflowId);
      this.executionDAOFacade.removeFromPendingWorkflow(workflow.workflowName, workflow.workflowId);
      return;
    }

    if (isWorkflowTerminal(workflow.status)) {
      throw new Error(`Workflow is already in terminal state. Current status: ${workflow.status}`);
    }

    this.deciderService.updateWorkflowOutput(workflow, null);
    workflow.status = 'COMPLETED';

    const failedTasks = workflow.tasks.filter(
      (t) => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR',
    );

    for (const t of failedTasks) {
      workflow.failedReferenceTaskNames.add(t.referenceTaskName);
      workflow.failedTaskNames.add(t.taskDefName);
    }

    this.executionDAOFacade.updateWorkflow(workflow);
    this.notifyWorkflowStatusListener(workflow, 'COMPLETED');

    if (workflow.parentWorkflowId) {
      this.updateParentWorkflowTask(workflow);
      this.expediteLazyWorkflowEvaluation(workflow.parentWorkflowId);
    }

    this.executionLockService.releaseLock(workflow.workflowId);
    this.executionLockService.deleteLock(workflow.workflowId);
  }

  terminateWorkflow(workflowId: string, reason: string): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) return;

    if (workflow.status === 'COMPLETED') {
      throw new ConflictException('Cannot terminate a COMPLETED workflow.');
    }
    if (workflow.status === 'TERMINATED') return;

    workflow.status = 'TERMINATED';
    this.terminateWorkflowWithFailure(workflow, reason, null);
  }

  terminateWorkflowWithFailure(
    workflow: WorkflowModel,
    reason: string,
    failureWorkflow: string | null,
  ): WorkflowModel {
    this.executionLockService.acquireLockWithLease(workflow.workflowId, 60000);

    try {
      if (!isWorkflowTerminal(workflow.status)) {
        workflow.status = 'TERMINATED';
      }

      try {
        this.deciderService.updateWorkflowOutput(workflow, null);
      } catch (e) {
        // continue termination
      }

      const failedTasks = workflow.tasks.filter(
        (t) => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR',
      );
      for (const t of failedTasks) {
        workflow.failedReferenceTaskNames.add(t.referenceTaskName);
        workflow.failedTaskNames.add(t.taskDefName);
      }

      workflow.reasonForIncompletion = reason;

      const cancelErrors = this.cancelNonTerminalTasks(workflow);
      if (cancelErrors.length > 0) {
        throw new Error(`Error canceling system tasks: ${cancelErrors.join(',')}`);
      }

      this.executionDAOFacade.updateWorkflow(workflow);
      this.notifyWorkflowStatusListener(workflow, 'TERMINATED');

      for (const task of workflow.tasks) {
        try {
          this.queueDAO.remove(task.taskDefName || task.taskType, task.taskId);
        } catch {
          // ignore queue errors during termination
        }
      }

      if (workflow.parentWorkflowId) {
        this.updateParentWorkflowTask(workflow);
        this.expediteLazyWorkflowEvaluation(workflow.parentWorkflowId);
      }

      if (failureWorkflow) {
        const input: Record<string, unknown> = { ...workflow.input };
        input['workflowId'] = workflow.workflowId;
        input['reason'] = reason;
        input['failureStatus'] = workflow.status;
        if (workflow.failedTaskId) {
          input['failureTaskId'] = workflow.failedTaskId;
        }
        input['failedWorkflow'] = { ...workflow };

        try {
          const failureWFId = generateId();
          this.startWorkflow({
            name: failureWorkflow,
            workflowInput: input,
            correlationId: workflow.correlationId ?? undefined,
            taskToDomain: workflow.taskToDomain ?? undefined,
            workflowId: failureWFId,
            triggeringWorkflowId: workflow.workflowId,
          });
          workflow.output['agentmesh.failure_workflow'] = failureWFId;
        } catch (e) {
          workflow.output['agentmesh.failure_workflow'] =
            `Error workflow ${failureWorkflow} failed to start. reason: ${(e as Error).message}`;
        }
        this.executionDAOFacade.updateWorkflow(workflow);
      }

      this.executionDAOFacade.removeFromPendingWorkflow(workflow.workflowName, workflow.workflowId);
    } finally {
      this.executionLockService.releaseLock(workflow.workflowId);
      this.executionLockService.deleteLock(workflow.workflowId);
    }

    return workflow;
  }

  updateTask(taskResult: TaskResult): TaskModel | null {
    if (!taskResult) throw new Error('Task object is null');
    if (taskResult.extendLease) {
      this.extendLease(taskResult);
      return null;
    }

    const workflowId = taskResult.workflowInstanceId;
    const workflowInstance = this.executionDAOFacade.getWorkflowModel(workflowId, false);
    if (!workflowInstance) return null;

    const task = this.executionDAOFacade.getTaskModel(taskResult.taskId);
    if (!task) throw new Error(`No such task found by id: ${taskResult.taskId}`);

    const taskQueueName = task.taskDefName || task.taskType;

    if (isTaskTerminal(task.status)) {
      this.queueDAO.remove(taskQueueName, taskResult.taskId);
      return task;
    }

    if (isWorkflowTerminal(workflowInstance.status)) {
      this.queueDAO.remove(taskQueueName, taskResult.taskId);
      return task;
    }

    if (
      !this.systemTaskRegistry.isSystemTask(task.taskType) &&
      taskResult.status === 'IN_PROGRESS'
    ) {
      task.status = 'SCHEDULED';
    } else {
      task.status = taskResult.status as TaskStatus;
    }

    task.outputMessage = taskResult.outputMessage ?? null;
    task.reasonForIncompletion = taskResult.reasonForIncompletion ?? null;
    task.workerId = taskResult.workerId ?? null;
    task.callbackAfterSeconds = taskResult.callbackAfterSeconds;
    task.outputData = { ...taskResult.outputData };
    task.subWorkflowId = taskResult.subWorkflowId ?? null;

    if (taskResult.externalOutputPayloadStoragePath) {
      task.externalOutputPayloadStoragePath = taskResult.externalOutputPayloadStoragePath;
    }

    if (isTaskTerminal(task.status)) {
      task.endTime = Date.now();
    }

    switch (task.status) {
      case 'COMPLETED':
      case 'CANCELED':
      case 'FAILED':
      case 'FAILED_WITH_TERMINAL_ERROR':
      case 'TIMED_OUT':
        try {
          this.queueDAO.remove(taskQueueName, taskResult.taskId);
        } catch {
          // ignore queue remove errors
        }
        break;
      case 'IN_PROGRESS':
      case 'SCHEDULED':
        try {
          this.queueDAO.postpone(
            taskQueueName,
            task.taskId,
            task.workflowPriority,
            taskResult.callbackAfterSeconds,
          );
        } catch (e) {
          throw new Error(
            `Error postponing the message in queue for task: ${task.taskId} for workflow: ${workflowId}`,
          );
        }
        break;
    }

    try {
      this.executionDAOFacade.updateTask(task);
    } catch (e) {
      throw new Error(`Error updating task: ${task.taskId} for workflow: ${workflowId}`);
    }

    try {
      this.notifyTaskStatusListener(task);
    } catch {
      // ignore listener errors
    }

    const taskLogs = taskResult.logs;
    if (taskLogs && taskLogs.length > 0) {
      const logsWithTaskId = taskLogs.map((log) => ({
        ...log,
        taskId: task.taskId,
      }));
      this.executionDAOFacade.addTaskExecLog(logsWithTaskId);
    }

    if (
      this.properties.humanTaskPreventsDeciderQueue &&
      task.taskType === 'HUMAN' &&
      isTaskTerminal(task.status)
    ) {
      this.queueDAO.push(DECIDER_QUEUE, workflowId, workflowInstance.priority, 0);
    }

    if (!this.isLazyEvaluateWorkflow(workflowInstance.workflowDefinition, task)) {
      this.decide(workflowId);
    }

    return task;
  }

  private notifyTaskStatusListener(task: TaskModel): void {
    switch (task.status) {
      case 'COMPLETED':
        this.taskStatusListener.onTaskCompletedIfEnabled(task);
        break;
      case 'CANCELED':
        this.taskStatusListener.onTaskCanceledIfEnabled(task);
        break;
      case 'FAILED':
        this.taskStatusListener.onTaskFailedIfEnabled(task);
        break;
      case 'FAILED_WITH_TERMINAL_ERROR':
        this.taskStatusListener.onTaskFailedWithTerminalErrorIfEnabled(task);
        break;
      case 'TIMED_OUT':
        this.taskStatusListener.onTaskTimedOutIfEnabled(task);
        break;
      case 'IN_PROGRESS':
        this.taskStatusListener.onTaskInProgressIfEnabled(task);
        break;
    }
  }

  private extendLease(taskResult: TaskResult): void {
    const task = this.executionDAOFacade.getTaskModel(taskResult.taskId);
    if (!task) throw new Error(`No such task found by id: ${taskResult.taskId}`);

    if (!isTaskTerminal(task.status)) {
      try {
        this.executionDAOFacade.extendLease(task);
      } catch (e) {
        throw new Error(`Error extending lease for Task: ${task.taskId}`);
      }
    }
  }

  private isLazyEvaluateWorkflow(workflowDef: WorkflowDef | null, task: TaskModel): boolean {
    if (!workflowDef) return false;
    if (task.loopOverTask) return false;

    return false;
  }

  getTask(taskId: string): TaskModel | null {
    const task = this.executionDAOFacade.getTaskModel(taskId);
    if (task && task.workflowTask) {
      return this.metadataMapperService.populateTaskWithDefinition(task);
    }
    return task;
  }

  getRunningWorkflows(workflowName: string, version: number): WorkflowModel[] {
    return this.executionDAOFacade.getPendingWorkflowsByName(workflowName, version);
  }

  getWorkflows(name: string, version: number, startTime: number, endTime: number): string[] {
    return this.executionDAOFacade
      .getWorkflowsByName(name, startTime, endTime)
      .filter((w) => w.workflowVersion === version)
      .map((w) => w.workflowId);
  }

  getRunningWorkflowIds(workflowName: string, version: number): string[] {
    return this.executionDAOFacade.getRunningWorkflowIds(workflowName, version);
  }

  decide(workflowId: string): WorkflowModel | null {
    const lockAcquired = this.executionLockService.acquireLock(workflowId);
    if (!lockAcquired) return null;

    try {
      const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
      if (!workflow) return null;
      return this.decideInternal(workflow);
    } finally {
      if (lockAcquired) {
        this.executionLockService.releaseLock(workflowId);
      }
    }
  }

  decideWithLock(workflow: WorkflowModel): WorkflowModel | null {
    if (!this.executionLockService.acquireLock(workflow.workflowId)) {
      return null;
    }

    try {
      return this.decideInternal(workflow);
    } finally {
      this.executionLockService.releaseLock(workflow.workflowId);
    }
  }

  private decideInternal(workflow: WorkflowModel): WorkflowModel {
    if (isWorkflowTerminal(workflow.status)) {
      if (!isWorkflowSuccessful(workflow.status)) {
        this.cancelNonTerminalTasks(workflow);
      }
      return workflow;
    }

    this.adjustStateIfSubWorkflowChanged(workflow);
    this.resetUnsuccessfulJoinTasksWithActiveBranches(workflow);

    const maxRuntime = this.properties.lockLeaseTime - 100;
    const startTime = Date.now();

    try {
      let continueLoop = true;
      while (continueLoop) {
        continueLoop = false;

        const outcome = this.deciderService.decide(workflow);

        if (outcome.isComplete) {
          this.endExecution(workflow, outcome.terminateTask);
          return workflow;
        }

        let tasksToBeScheduled = outcome.tasksToBeScheduled;
        this.setTaskDomains(tasksToBeScheduled, workflow);
        const tasksToBeUpdated = outcome.tasksToBeUpdated;

        tasksToBeScheduled = this.dedupAndAddTasks(workflow, tasksToBeScheduled);

        let stateChanged = this.scheduleTask(workflow, tasksToBeScheduled);

        for (const task of outcome.tasksToBeScheduled) {
          this.executionDAOFacade.populateTaskData(task);
          if (this.systemTaskRegistry.isSystemTask(task.taskType) && !isTaskTerminal(task.status)) {
            const workflowSystemTask = this.systemTaskRegistry.get(task.taskType);
            if (!workflowSystemTask.isAsync() && workflowSystemTask.execute(workflow, task, this)) {
              tasksToBeUpdated.push(task);
              stateChanged = true;
            }
          }
        }

        if (tasksToBeUpdated.length > 0 || tasksToBeScheduled.length > 0) {
          this.executionDAOFacade.updateTasks(tasksToBeUpdated);
        }

        if (stateChanged) {
          if (Date.now() - startTime < maxRuntime) {
            continueLoop = true;
            continue;
          }
          this.executionDAOFacade.updateWorkflow(workflow);
          this.queueDAO.push(DECIDER_QUEUE, workflow.workflowId, 0, 0);
          return workflow;
        }

        if (tasksToBeUpdated.length > 0 || tasksToBeScheduled.length > 0) {
          this.executionDAOFacade.updateWorkflow(workflow);
        }

        if (!isWorkflowTerminal(workflow.status)) {
          if (this.properties.humanTaskPreventsDeciderQueue && hasInProgressHumanTask(workflow)) {
            this.queueDAO.remove(DECIDER_QUEUE, workflow.workflowId);
          } else {
            const updatedOffset = Math.min(
              this.properties.workflowOffsetTimeout,
              this.properties.maxPostponeDurationSeconds,
            );
            this.queueDAO.setUnackTimeout(DECIDER_QUEUE, workflow.workflowId, updatedOffset * 1000);
          }
        }
      }

      return workflow;
    } catch (error) {
      if (error instanceof TerminateWorkflowError) {
        this.terminate(workflow, error);
        return workflow;
      }
      throw error;
    }
  }

  private adjustStateIfSubWorkflowChanged(workflow: WorkflowModel): void {
    const changedTask = workflow.tasks.find(
      (t) => t.taskType === 'SUB_WORKFLOW' && t.subworkflowChanged && !t.retried,
    );
    if (changedTask) {
      changedTask.subworkflowChanged = false;
      this.executionDAOFacade.updateTask(changedTask);
      this.resetUnsuccessfulJoinTasks(workflow);
    }
  }

  private resetUnsuccessfulJoinTasksWithActiveBranches(workflow: WorkflowModel): void {
    const wfDef = workflow.workflowDefinition;
    const hasJoin = wfDef?.tasks.some((t) => t.type === 'JOIN' || t.type === 'FORK_JOIN_DYNAMIC');
    if (!hasJoin) return;

    const activeReferenceTaskNames = new Set(
      workflow.tasks.filter((t) => !isTaskTerminal(t.status)).map((t) => t.referenceTaskName),
    );

    if (activeReferenceTaskNames.size === 0) return;

    for (const task of workflow.tasks) {
      if (
        (task.taskType === 'JOIN' || task.taskType === 'EXCLUSIVE_JOIN') &&
        isTaskTerminal(task.status) &&
        !isTaskSuccessful(task.status)
      ) {
        const joinOn = task.inputData['joinOn'] as string[] | undefined;
        if (joinOn?.some((ref) => activeReferenceTaskNames.has(ref))) {
          task.status = 'IN_PROGRESS';
          this.addTaskToQueue(task);
          this.executionDAOFacade.updateTask(task);
        }
      }
    }
  }

  private cancelNonTerminalTasks(workflow: WorkflowModel, raiseFinalized = true): string[] {
    const erroredTasks: string[] = [];

    for (const task of workflow.tasks) {
      if (!isTaskTerminal(task.status)) {
        task.status = 'CANCELED';

        try {
          this.notifyTaskStatusListener(task);
        } catch {
          // ignore
        }

        if (this.systemTaskRegistry.isSystemTask(task.taskType)) {
          const systemTask = this.systemTaskRegistry.get(task.taskType);
          try {
            systemTask.cancel(workflow, task, this);
          } catch (e) {
            erroredTasks.push(task.referenceTaskName);
          }
        }

        this.executionDAOFacade.updateTask(task);
      }
    }

    if (erroredTasks.length === 0) {
      try {
        if (raiseFinalized) {
          this.notifyWorkflowStatusListener(workflow, 'FINALIZED');
        }
        this.queueDAO.remove(DECIDER_QUEUE, workflow.workflowId);
      } catch {
        // ignore queue errors
      }
    }

    return erroredTasks;
  }

  private dedupAndAddTasks(workflow: WorkflowModel, tasks: TaskModel[]): TaskModel[] {
    const tasksInWorkflow = new Set(
      workflow.tasks.map((t) => `${t.referenceTaskName}_${t.retryCount}`),
    );

    const dedupedTasks = tasks.filter(
      (t) => !tasksInWorkflow.has(`${t.referenceTaskName}_${t.retryCount}`),
    );

    workflow.tasks.push(...dedupedTasks);
    return dedupedTasks;
  }

  pauseWorkflow(workflowId: string): void {
    this.executionLockService.acquireLockWithLease(workflowId, 60000);

    try {
      const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, false);
      if (!workflow) return;

      if (isWorkflowTerminal(workflow.status)) {
        throw new ConflictException(`Workflow ${workflowId} has ended, status cannot be updated.`);
      }
      if (workflow.status === 'PAUSED') return;

      workflow.status = 'PAUSED';
      this.executionDAOFacade.updateWorkflow(workflow);
      this.notifyWorkflowStatusListener(workflow, 'PAUSED');
    } finally {
      this.executionLockService.releaseLock(workflowId);
    }

    try {
      this.queueDAO.remove(DECIDER_QUEUE, workflowId);
    } catch {
      // ignore
    }
  }

  resumeWorkflow(workflowId: string): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, false);
    if (!workflow) return;

    if (workflow.status !== 'PAUSED') {
      throw new ConflictException(
        `The workflow ${workflowId} is not PAUSED so cannot resume. Current status is ${workflow.status}`,
      );
    }

    workflow.status = 'RUNNING';
    workflow.lastRetriedTime = Date.now();

    this.queueDAO.push(
      DECIDER_QUEUE,
      workflow.workflowId,
      workflow.priority,
      this.properties.workflowOffsetTimeout,
    );
    this.executionDAOFacade.updateWorkflow(workflow);
    this.notifyWorkflowStatusListener(workflow, 'RESUMED');
    this.decide(workflowId);
  }

  skipTaskFromWorkflow(
    workflowId: string,
    taskReferenceName: string,
    skipTaskRequest?: {
      taskInput?: Record<string, unknown>;
      taskOutput?: Record<string, unknown>;
      taskInputMessage?: string;
      taskOutputMessage?: string;
    },
  ): void {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) return;

    if (workflow.status !== 'RUNNING') {
      throw new Error(
        `The workflow ${workflowId} is not running so the task referenced by ${taskReferenceName} cannot be skipped`,
      );
    }

    const workflowTask = workflow.workflowDefinition
      ? getTaskByRefName(workflow.workflowDefinition, taskReferenceName)
      : null;
    if (!workflowTask) {
      throw new Error(
        `The task referenced by ${taskReferenceName} does not exist in the WorkflowDefinition ${workflow.workflowName}`,
      );
    }

    for (const task of workflow.tasks) {
      if (task.referenceTaskName === taskReferenceName) {
        throw new Error(
          `The task referenced ${taskReferenceName} has already been processed, cannot be skipped`,
        );
      }
    }

    const taskToBeSkipped = createTaskModel({
      taskId: generateId(),
      referenceTaskName: taskReferenceName,
      workflowInstanceId: workflowId,
      workflowPriority: workflow.priority,
      status: 'SKIPPED',
      endTime: Date.now(),
      taskType: workflowTask.name ?? '',
      correlationId: workflow.correlationId,
      inputData: skipTaskRequest?.taskInput ?? {},
      outputData: skipTaskRequest?.taskOutput ?? {},
      inputMessage: skipTaskRequest?.taskInputMessage ?? null,
      outputMessage: skipTaskRequest?.taskOutputMessage ?? null,
    });

    this.executionDAOFacade.createTasks([taskToBeSkipped]);
    this.decide(workflow.workflowId);
  }

  getWorkflow(workflowId: string, includeTasks: boolean): WorkflowModel | null {
    return this.executionDAOFacade.getWorkflowModel(workflowId, includeTasks);
  }

  private addTaskToQueue(task: TaskModel): void {
    const taskQueueName = task.taskDefName || task.taskType;

    if (task.callbackAfterMs > 0) {
      this.queueDAO.pushDuration(taskQueueName, task.taskId, task.workflowPriority, {
        seconds: Math.ceil(task.callbackAfterMs / 1000),
      });
    } else if (task.callbackAfterSeconds > 0) {
      this.queueDAO.push(
        taskQueueName,
        task.taskId,
        task.workflowPriority,
        task.callbackAfterSeconds,
      );
    } else {
      this.queueDAO.push(taskQueueName, task.taskId, task.workflowPriority, 0);
    }
  }

  setTaskDomains(tasks: TaskModel[], workflow: WorkflowModel): void {
    const taskToDomain = workflow.taskToDomain;
    if (!taskToDomain) return;

    const domainStr = taskToDomain['*'];
    if (domainStr) {
      const domains = domainStr.split(',');
      for (const task of tasks) {
        if (!this.systemTaskRegistry.isSystemTask(task.taskType)) {
          task.domain = this.getActiveDomain(task.taskType, domains);
        }
      }
    }

    for (const task of tasks) {
      if (!this.systemTaskRegistry.isSystemTask(task.taskType)) {
        const taskDomainStr = taskToDomain[task.taskType];
        if (taskDomainStr) {
          task.domain = this.getActiveDomain(task.taskType, taskDomainStr.split(','));
        }
      }
    }
  }

  private getActiveDomain(taskType: string, domains: string[]): string | null {
    if (!domains || domains.length === 0) return null;

    for (const domain of domains) {
      const trimmed = domain.trim();
      if (trimmed.toLowerCase() === 'no_domain') continue;
      const pollData = this.executionDAOFacade.getTaskPollDataByDomain(taskType, trimmed);
      if (pollData && pollData.lastPollTime > Date.now() - this.activeWorkerLastPollMs) {
        return pollData.domain;
      }
    }

    const lastEntry = domains[domains.length - 1];
    if (!lastEntry) return null;
    const lastDomain = lastEntry.trim();
    return lastDomain.toLowerCase() === 'no_domain' ? null : lastDomain;
  }

  private scheduleTask(workflow: WorkflowModel, tasks: TaskModel[]): boolean {
    let startedSystemTasks = false;

    try {
      if (!tasks || tasks.length === 0) return false;

      let count = workflow.tasks.reduce((max, t) => Math.max(max, t.seq), 0);

      for (const task of tasks) {
        if (task.seq === 0) {
          task.seq = ++count;
        }
        if (task.firstScheduledTime === 0) {
          task.firstScheduledTime = Date.now();
        }
      }

      this.executionDAOFacade.createTasks(tasks);

      const systemTasks = tasks.filter((t) => this.systemTaskRegistry.isSystemTask(t.taskType));
      const tasksToBeQueued = tasks.filter(
        (t) => !this.systemTaskRegistry.isSystemTask(t.taskType),
      );

      for (const task of systemTasks) {
        const workflowSystemTask = this.systemTaskRegistry.get(task.taskType);
        if (!workflowSystemTask) {
          throw new Error(`No system task found by name ${task.taskType}`);
        }

        if (task.status != null && !isTaskTerminal(task.status) && task.startTime === 0) {
          task.startTime = Date.now();
        }

        if (!workflowSystemTask.isAsync()) {
          try {
            workflowSystemTask.start(workflow, task, this);
          } catch (e) {
            throw new Error(
              `Unable to start system task: ${task.taskType}, {id: ${task.taskId}, name: ${task.taskDefName}}`,
            );
          }
          startedSystemTasks = true;
          this.executionDAOFacade.updateTask(task);
        } else {
          tasksToBeQueued.push(task);
        }
      }
    } catch (e) {
      const taskIds = tasks.map((t) => t.taskId);
      throw new TerminateWorkflowError(
        `Error scheduling tasks: ${taskIds.join(',')}, for workflow: ${workflow.workflowId}`,
      );
    }

    try {
      this.addTasksToQueue(tasks.filter((t) => !this.systemTaskRegistry.isSystemTask(t.taskType)));
    } catch {
      // ignore queue errors
    }

    return startedSystemTasks;
  }

  private addTasksToQueue(tasks: TaskModel[]): void {
    for (const task of tasks) {
      this.addTaskToQueue(task);
      try {
        this.taskStatusListener.onTaskScheduledIfEnabled(task);
      } catch {
        // ignore
      }
    }
  }

  private terminate(
    workflow: WorkflowModel,
    terminateWorkflowException: TerminateWorkflowError,
  ): void {
    if (!isWorkflowTerminal(workflow.status)) {
      workflow.status = terminateWorkflowException.workflowStatus as WorkflowStatus;
    }

    if (terminateWorkflowException.task && !workflow.failedTaskId) {
      workflow.failedTaskId = terminateWorkflowException.task.taskId;
    }

    let failureWorkflow = workflow.workflowDefinition?.failureWorkflow ?? null;
    if (failureWorkflow?.startsWith('$')) {
      const parts = failureWorkflow.split('.');
      const name = parts[2];
      failureWorkflow = name ? ((workflow.input[name] as string) ?? null) : null;
    }

    if (terminateWorkflowException.task) {
      this.executionDAOFacade.updateTask(terminateWorkflowException.task);
    }

    this.terminateWorkflowWithFailure(
      workflow,
      terminateWorkflowException.message,
      failureWorkflow,
    );
  }

  private rerunWF(
    workflowId: string,
    taskId: string | undefined,
    taskInput: Record<string, unknown> | undefined,
    workflowInput: Record<string, unknown> | undefined,
    correlationId: string | undefined,
  ): boolean {
    const workflow = this.executionDAOFacade.getWorkflowModel(workflowId, true);
    if (!workflow) return false;

    if (!isWorkflowTerminal(workflow.status)) {
      throw new Error(`Workflow: ${workflowId} is not in terminal state, unable to rerun.`);
    }

    if (taskId == null) {
      for (const task of workflow.tasks) {
        this.executionDAOFacade.removeTask(task.taskId);
      }
      workflow.tasks = [];
      workflow.status = 'RUNNING';
      workflow.reasonForIncompletion = null;
      workflow.failedTaskId = null;
      workflow.failedReferenceTaskNames = new Set();
      workflow.failedTaskNames = new Set();

      if (correlationId) workflow.correlationId = correlationId;
      if (workflowInput) workflow.input = workflowInput;

      this.queueDAO.push(
        DECIDER_QUEUE,
        workflow.workflowId,
        workflow.priority,
        this.properties.workflowOffsetTimeout,
      );
      this.executionDAOFacade.updateWorkflow(workflow);
      this.notifyWorkflowStatusListener(workflow, 'RERAN');
      this.decide(workflowId);
      return true;
    }

    let rerunFromTask: TaskModel | null = null;
    for (const task of workflow.tasks) {
      if (task.taskId === taskId) {
        rerunFromTask = task;
        break;
      }
    }

    if (!rerunFromTask) {
      for (const task of workflow.tasks) {
        if (task.taskType === 'SUB_WORKFLOW') {
          const subWorkflowId = task.subWorkflowId;
          if (
            subWorkflowId &&
            this.rerunWF(subWorkflowId, taskId, taskInput ?? undefined, undefined, undefined)
          ) {
            rerunFromTask = task;
            break;
          }
        }
      }
    }

    if (rerunFromTask) {
      workflow.status = 'RUNNING';
      workflow.reasonForIncompletion = null;
      workflow.failedTaskId = null;
      workflow.failedReferenceTaskNames = new Set();
      workflow.failedTaskNames = new Set();

      if (correlationId) workflow.correlationId = correlationId;
      if (workflowInput) workflow.input = workflowInput;

      this.queueDAO.push(
        DECIDER_QUEUE,
        workflow.workflowId,
        workflow.priority,
        this.properties.workflowOffsetTimeout,
      );
      this.executionDAOFacade.updateWorkflow(workflow);
      this.notifyWorkflowStatusListener(workflow, 'RETRIED');

      this.executionDAOFacade.updateTasks(workflow.tasks);

      const filteredTasks: TaskModel[] = [];
      for (const task of workflow.tasks) {
        if (task.seq > rerunFromTask.seq) {
          this.executionDAOFacade.removeTask(task.taskId);
        } else {
          filteredTasks.push(task);
        }
      }
      workflow.tasks = filteredTasks;

      rerunFromTask.scheduledTime = Date.now();
      rerunFromTask.startTime = 0;
      rerunFromTask.updateTime = 0;
      rerunFromTask.endTime = 0;
      rerunFromTask.outputData = {};
      rerunFromTask.retried = false;
      rerunFromTask.executed = false;

      if (rerunFromTask.taskType === 'SUB_WORKFLOW') {
        rerunFromTask.status = 'IN_PROGRESS';
        rerunFromTask.startTime = Date.now();
      } else {
        if (
          this.systemTaskRegistry.isSystemTask(rerunFromTask.taskType) &&
          !this.systemTaskRegistry.get(rerunFromTask.taskType).isAsync()
        ) {
          this.systemTaskRegistry.get(rerunFromTask.taskType).start(workflow, rerunFromTask, this);
        } else {
          rerunFromTask.status = 'SCHEDULED';
          this.addTaskToQueue(rerunFromTask);
        }
      }

      this.executionDAOFacade.updateTask(rerunFromTask);
      this.decide(workflow.workflowId);
      return true;
    }

    return false;
  }

  scheduleNextIteration(loopTask: TaskModel, workflow: WorkflowModel): void {
    if (!loopTask.workflowTask?.loopOver || loopTask.workflowTask.loopOver.length === 0) return;

    const firstLoopTask = loopTask.workflowTask.loopOver[0];
    if (!firstLoopTask) return;

    const scheduledLoopOverTasks = this.deciderService.getTasksToBeScheduled(
      workflow,
      firstLoopTask,
      loopTask.retryCount,
    );

    this.setTaskDomains(scheduledLoopOverTasks, workflow);

    for (const t of scheduledLoopOverTasks) {
      t.referenceTaskName = appendIteration(t.referenceTaskName, loopTask.iteration);
      t.iteration = loopTask.iteration;
    }

    this.scheduleTask(workflow, scheduledLoopOverTasks);
    workflow.tasks.push(...scheduledLoopOverTasks);
  }

  private updateParentWorkflowTask(subWorkflow: WorkflowModel): void {
    const subWorkflowTask = this.executionDAOFacade.getTaskModel(
      subWorkflow.parentWorkflowTaskId ?? '',
    );
    if (!subWorkflowTask) return;

    const subWorkflowSystemTask = this.systemTaskRegistry.get('SUB_WORKFLOW');
    subWorkflowSystemTask.execute(subWorkflow, subWorkflowTask, this);
    this.executionDAOFacade.updateTask(subWorkflowTask);
  }

  private expediteLazyWorkflowEvaluation(workflowId: string): void {
    if (this.queueDAO.containsMessage(DECIDER_QUEUE, workflowId)) {
      this.queueDAO.postpone(DECIDER_QUEUE, workflowId, EXPEDITED_PRIORITY, 0);
    } else {
      this.queueDAO.push(DECIDER_QUEUE, workflowId, EXPEDITED_PRIORITY, 0);
    }
  }

  private isJoinOnFailedPermissive(joinOn: string[], workflow: WorkflowModel): boolean {
    return joinOn.some((ref) => {
      const t = workflow.tasks.find((x) => x.referenceTaskName === ref);
      return (
        t?.workflowTask?.permissive === true &&
        t.workflowTask?.optional !== true &&
        t.status === 'FAILED'
      );
    });
  }

  startWorkflow(input: StartWorkflowInput): string {
    const workflowId = input.workflowId ?? generateId();
    const workflow = createWorkflowModel({
      workflowId,
      workflowName: input.name ?? '',
      workflowVersion: input.version ?? 1,
      status: 'RUNNING',
      input: input.workflowInput ?? {},
      correlationId: input.correlationId ?? null,
      priority: input.priority ?? 0,
      parentWorkflowId: input.parentWorkflowId ?? null,
      parentWorkflowTaskId: input.parentWorkflowTaskId ?? null,
      taskToDomain: input.taskToDomain ?? null,
      ownerApp: 'unknown',
      event: input.event ?? null,
      workflowDefinition: (input.workflowDefinition as any) ?? null,
    });

    try {
      this.createAndEvaluate(workflow);
      return workflowId;
    } catch (e) {
      try {
        this.executionDAOFacade.removeWorkflow(workflowId, false);
      } catch {
        // ignore cleanup errors
      }
      throw e;
    }
  }

  startWorkflowIdempotent(input: StartWorkflowInput): WorkflowModel {
    if (!input.workflowId) {
      throw new Error('workflowId must be present for idempotent workflow start');
    }

    const workflowId = input.workflowId;

    if (!this.executionLockService.acquireLock(workflowId)) {
      throw new Error(`Error acquiring lock when creating workflow: ${workflowId}`);
    }

    let createAttempted = false;

    try {
      try {
        const existingWorkflow = this.executionDAOFacade.getWorkflowModelFromExecutionDAO(
          workflowId,
          false,
        );
        return existingWorkflow;
      } catch {
        // Not found, proceed with creation
      }

      const workflow = createWorkflowModel({
        workflowId,
        workflowName: input.name ?? '',
        workflowVersion: input.version ?? 1,
        status: 'RUNNING',
        input: input.workflowInput ?? {},
        correlationId: input.correlationId ?? null,
        priority: input.priority ?? 0,
        parentWorkflowId: input.parentWorkflowId ?? null,
        parentWorkflowTaskId: input.parentWorkflowTaskId ?? null,
        taskToDomain: input.taskToDomain ?? null,
        ownerApp: 'unknown',
        workflowDefinition: (input.workflowDefinition as any) ?? null,
      });

      createAttempted = true;
      this.createAndQueueEvaluationWithLock(workflow);
      return workflow;
    } catch (e) {
      try {
        if (createAttempted) {
          this.executionDAOFacade.removeWorkflow(workflowId, false);
        }
      } catch {
        // ignore
      }
      throw e;
    } finally {
      this.executionLockService.releaseLock(workflowId);
    }
  }

  private createAndEvaluate(workflow: WorkflowModel): void {
    if (!this.executionLockService.acquireLock(workflow.workflowId)) {
      throw new Error(`Error acquiring lock when creating workflow: ${workflow.workflowId}`);
    }

    try {
      this.metadataMapperService.populateWorkflowWithDefinitions(workflow);
      this.executionDAOFacade.createWorkflow(workflow);
      this.executionDAOFacade.populateWorkflowAndTaskPayloadData(workflow);
      this.notifyWorkflowStatusListener(workflow, 'STARTED');
      this.decideInternal(workflow);
    } finally {
      this.executionLockService.releaseLock(workflow.workflowId);
    }
  }

  private createAndQueueEvaluationWithLock(workflow: WorkflowModel): void {
    this.metadataMapperService.populateWorkflowWithDefinitions(workflow);
    this.executionDAOFacade.createWorkflow(workflow);
    this.executionDAOFacade.populateWorkflowAndTaskPayloadData(workflow);
    this.notifyWorkflowStatusListener(workflow, 'STARTED');

    try {
      this.expediteLazyWorkflowEvaluation(workflow.workflowId);
    } catch {
      // ignore
    }
  }

  private notifyWorkflowStatusListener(workflow: WorkflowModel, event: string): void {
    try {
      switch (event) {
        case 'STARTED':
          this.workflowStatusListener.onWorkflowStartedIfEnabled(workflow);
          break;
        case 'RERAN':
          this.workflowStatusListener.onWorkflowRerunIfEnabled(workflow);
          break;
        case 'RETRIED':
          this.workflowStatusListener.onWorkflowRetriedIfEnabled(workflow);
          break;
        case 'PAUSED':
          this.workflowStatusListener.onWorkflowPausedIfEnabled(workflow);
          break;
        case 'RESUMED':
          this.workflowStatusListener.onWorkflowResumedIfEnabled(workflow);
          break;
        case 'RESTARTED':
          this.workflowStatusListener.onWorkflowRestartedIfEnabled(workflow);
          break;
        case 'COMPLETED':
          this.workflowStatusListener.onWorkflowCompletedIfEnabled(workflow);
          break;
        case 'TERMINATED':
          this.workflowStatusListener.onWorkflowTerminatedIfEnabled(workflow);
          break;
        case 'FINALIZED':
          this.workflowStatusListener.onWorkflowFinalizedIfEnabled(workflow);
          break;
      }
    } catch {
      // ignore listener errors
    }
  }
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function appendIteration(refName: string, iteration: number): string {
  return `${refName}_${iteration}`;
}
