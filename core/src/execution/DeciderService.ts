import type { TaskDef, WorkflowTask, WorkflowDef, TaskType as TaskTypeEnum, TaskStatus } from '@conductor/common';
import { isTaskTerminal, isTaskSuccessful, isTaskRetriable, isBuiltInTask } from '@conductor/common';
import type { TaskModel, WorkflowModel } from './types.js';
import { copyTaskModel } from './types.js';
import type { TaskMapper } from './mappers/TaskMapper.js';
import { TaskMapperContext } from './mappers/TaskMapperContext.js';
import { resolveTaskInput } from './ParametersUtils.js';
import type { SystemTaskRegistry } from './SystemTaskRegistry.js';
import { getTaskByRefName, getNextTask } from './ExecutorUtils.js';

export class DeciderOutcome {
  tasksToBeScheduled: TaskModel[] = [];
  tasksToBeUpdated: TaskModel[] = [];
  isComplete = false;
  terminateTask: TaskModel | null = null;
}

export class DeciderService {
  private taskMappers: Map<string, TaskMapper>;
  private systemTaskRegistry: SystemTaskRegistry;
  private taskPendingTimeThresholdMins: number;

  constructor(params: {
    taskMappers: Record<string, TaskMapper>;
    systemTaskRegistry: SystemTaskRegistry;
    taskPendingTimeThresholdMins?: number;
  }) {
    this.taskMappers = new Map(Object.entries(params.taskMappers));
    this.systemTaskRegistry = params.systemTaskRegistry;
    this.taskPendingTimeThresholdMins = params.taskPendingTimeThresholdMins ?? 60;
  }

  decide(workflow: WorkflowModel): DeciderOutcome {
    const tasks = workflow.tasks;

    const unprocessedTasks = tasks.filter(
      (t) => t.status !== 'SKIPPED' && !t.executed,
    );

    let tasksToBeScheduled: TaskModel[] = [];
    if (unprocessedTasks.length === 0) {
      tasksToBeScheduled = this.startWorkflow(workflow) ?? [];
    }

    return this.decideInternal(workflow, tasksToBeScheduled);
  }

  private decideInternal(
    workflow: WorkflowModel,
    preScheduledTasks: TaskModel[],
  ): DeciderOutcome {
    const outcome = new DeciderOutcome();

    if (isWorkflowTerminal(workflow.status)) {
      return outcome;
    }

    this.checkWorkflowTimeout(workflow);

    if (workflow.status === 'PAUSED') {
      return outcome;
    }

    const pendingTasks: TaskModel[] = [];
    const executedTaskRefNames = new Set<string>();
    let hasSuccessfulTerminateTask = false;
    let terminateTask: TaskModel | null = null;

    for (const task of workflow.tasks) {
      if (!task.retried && task.status !== 'SKIPPED' && !task.executed) {
        pendingTasks.push(task);
      }
      if (task.executed) {
        executedTaskRefNames.add(task.referenceTaskName);
      }
      if (
        task.taskType === 'TERMINATE' &&
        isTaskTerminal(task.status) &&
        isTaskSuccessful(task.status)
      ) {
        hasSuccessfulTerminateTask = true;
        terminateTask = task;
        outcome.terminateTask = task;
      }
    }

    const tasksToBeScheduled = new Map<string, TaskModel>();

    for (const preScheduledTask of preScheduledTasks) {
      tasksToBeScheduled.set(preScheduledTask.referenceTaskName, preScheduledTask);
    }

    for (const pendingTask of pendingTasks) {
      if (
        this.systemTaskRegistry.isSystemTask(pendingTask.taskType) &&
        !isTaskTerminal(pendingTask.status)
      ) {
        tasksToBeScheduled.set(
          pendingTask.referenceTaskName,
          pendingTask,
        );
        executedTaskRefNames.delete(pendingTask.referenceTaskName);
      }

      const taskDefinition =
        pendingTask.taskDefinition ?? this.getTaskDefFromWorkflow(pendingTask, workflow);

      if (taskDefinition) {
        this.checkTotalTimeout(taskDefinition, pendingTask);
        this.checkTaskTimeout(taskDefinition, pendingTask);
        this.checkTaskPollTimeout(taskDefinition, pendingTask);
        if (this.isResponseTimedOut(taskDefinition, pendingTask)) {
          this.timeoutTask(taskDefinition, pendingTask);
        }
      }

      if (isTaskTerminal(pendingTask.status) && !isTaskSuccessful(pendingTask.status)) {
        let workflowTask = pendingTask.workflowTask;
        if (!workflowTask && workflow.workflowDefinition) {
          workflowTask = getTaskByRefName(workflow.workflowDefinition, pendingTask.referenceTaskName);
        }

        const retryTask = this.retry(
          taskDefinition,
          workflowTask,
          pendingTask,
          workflow,
        );
        if (retryTask) {
          tasksToBeScheduled.set(retryTask.referenceTaskName, retryTask);
          executedTaskRefNames.delete(retryTask.referenceTaskName);
          outcome.tasksToBeUpdated.push(pendingTask);
        } else if (
          !(
            pendingTask.workflowTask?.permissive === true &&
            pendingTask.workflowTask?.optional !== true
          )
        ) {
          pendingTask.status = 'COMPLETED_WITH_ERRORS';
        }
      }

      if (
        !pendingTask.executed &&
        !pendingTask.retried &&
        isTaskTerminal(pendingTask.status)
      ) {
        pendingTask.executed = true;
        const nextTasks = this.getNextTask(workflow, pendingTask);
        if (
          pendingTask.loopOverTask &&
          pendingTask.taskType !== 'DO_WHILE' &&
          nextTasks.length > 0
        ) {
          const filtered = this.filterNextLoopOverTasks(
            nextTasks,
            pendingTask,
            workflow,
          );
          for (const nextTask of filtered) {
            tasksToBeScheduled.set(nextTask.referenceTaskName, nextTask);
          }
        } else {
          for (const nextTask of nextTasks) {
            tasksToBeScheduled.set(nextTask.referenceTaskName, nextTask);
          }
        }
        outcome.tasksToBeUpdated.push(pendingTask);
      }
    }

    const unScheduledTasks = Array.from(tasksToBeScheduled.values()).filter(
      (task) => !executedTaskRefNames.has(task.referenceTaskName),
    );

    if (unScheduledTasks.length > 0) {
      outcome.tasksToBeScheduled.push(...unScheduledTasks);
    }

    if (
      hasSuccessfulTerminateTask ||
      (outcome.tasksToBeScheduled.length === 0 &&
        this.checkForWorkflowCompletion(workflow))
    ) {
      const permissiveTasks = workflow.tasks
        .filter((t) => t.workflowTask != null)
        .filter((t) => t.workflowTask!.permissive === true)
        .filter((t) => t.workflowTask!.optional !== true);

      const permissiveTasksTerminalNonSuccessful = Array.from(
        permissiveTasks
          .reduce((map, t) => {
            const existing = map.get(t.referenceTaskName);
            if (!existing || t.retryCount > existing.retryCount) {
              map.set(t.referenceTaskName, t);
            }
            return map;
          }, new Map<string, TaskModel>())
          .values(),
      ).filter((t) => isTaskTerminal(t.status) && !isTaskSuccessful(t.status));

      if (permissiveTasksTerminalNonSuccessful.length > 0) {
        const errMsg = permissiveTasksTerminalNonSuccessful
          .map(
            (t) =>
              `Task ${t.taskId} failed with status: ${t.status} and reason: '${t.reasonForIncompletion}'`,
          )
          .join('. ');
        throw new TerminateWorkflowError(errMsg);
      }

      outcome.isComplete = true;
    }

    return outcome;
  }

  private startWorkflow(workflow: WorkflowModel): TaskModel[] | null {
    const workflowDef = workflow.workflowDefinition;
    if (!workflowDef) return null;

    if (workflow.reRunFromWorkflowId == null || workflow.tasks.length === 0) {
      if (workflowDef.tasks.length === 0) {
        throw new TerminateWorkflowError(
          'No tasks found to be executed',
          'COMPLETED',
        );
      }

      let taskToSchedule: WorkflowTask | null = workflowDef.tasks[0] ?? null;
      while (taskToSchedule && this.isTaskSkipped(taskToSchedule, workflow)) {
        taskToSchedule = getNextTask(workflowDef, taskToSchedule.taskReferenceName);
      }

      if (taskToSchedule) {
        return this.getTasksToBeScheduled(workflow, taskToSchedule, 0);
      }
      return null;
    }

    const rerunFromTask = workflow.tasks.find(() => true);
    if (rerunFromTask) {
      rerunFromTask.status = 'SCHEDULED';
      rerunFromTask.retried = true;
      rerunFromTask.retryCount = 0;
      return [rerunFromTask];
    }

    throw new TerminateWorkflowError(
      `The workflow ${workflow.workflowId} is marked for re-run from ${workflow.reRunFromWorkflowId} but could not find the starting task`,
    );
  }

  private filterNextLoopOverTasks(
    tasks: TaskModel[],
    pendingTask: TaskModel,
    workflow: WorkflowModel,
  ): TaskModel[] {
    for (const nextTask of tasks) {
      nextTask.referenceTaskName = appendIteration(
        nextTask.referenceTaskName,
        pendingTask.iteration,
      );
      nextTask.iteration = pendingTask.iteration;
    }

    const tasksInWorkflow = new Set(
      workflow.tasks
        .filter(
          (t) =>
            t.status === 'IN_PROGRESS' || isTaskTerminal(t.status),
        )
        .map((t) => t.referenceTaskName),
    );

    return tasks.filter(
      (t) => !tasksInWorkflow.has(t.referenceTaskName),
    );
  }

  updateWorkflowOutput(workflow: WorkflowModel, task: TaskModel | null): void {
    const allTasks = workflow.tasks;
    if (allTasks.length === 0) return;

    let output: Record<string, unknown> = {};

    const terminateTask = allTasks.find(
      (t) =>
        t.taskType === 'TERMINATE' &&
        isTaskTerminal(t.status) &&
        isTaskSuccessful(t.status),
    );

    if (terminateTask) {
      if (terminateTask.externalOutputPayloadStoragePath) {
        output = {};
      } else if (Object.keys(terminateTask.outputData).length > 0) {
        output = { ...terminateTask.outputData };
      }
    } else {
      const last = task ?? allTasks[allTasks.length - 1] ?? null;
      const workflowDef = workflow.workflowDefinition;
      if (workflowDef?.outputParameters && Object.keys(workflowDef.outputParameters).length > 0) {
        output = resolveTemplate(workflowDef.outputParameters, workflow);
      } else if (last) {
        output = { ...last.outputData };
      }
    }

    workflow.output = output;
  }

  checkForWorkflowCompletion(workflow: WorkflowModel): boolean {
    const taskStatusMap = new Map<string, TaskStatus>();
    const nonExecutedTasks: TaskModel[] = [];

    for (const task of workflow.tasks) {
      taskStatusMap.set(task.referenceTaskName, task.status);
      if (!isTaskTerminal(task.status)) {
        return false;
      }

      if (
        task.taskType === 'TERMINATE' &&
        isTaskTerminal(task.status) &&
        isTaskSuccessful(task.status)
      ) {
        return true;
      }

      if (!task.retried && !task.executed) {
        nonExecutedTasks.push(task);
      }
    }

    if (taskStatusMap.size === 0) return false;

    const workflowTasks = workflow.workflowDefinition?.tasks ?? [];

    for (const wftask of workflowTasks) {
      const status = taskStatusMap.get(wftask.taskReferenceName);
      if (status == null || !isTaskTerminal(status)) {
        return false;
      }
    }

    const noPendingSchedule = nonExecutedTasks.every((wftask) => {
      const next = this.getNextTasksToBeScheduled(workflow, wftask);
      return next == null || taskStatusMap.has(next);
    });

    return noPendingSchedule;
  }

  getNextTask(workflow: WorkflowModel, task: TaskModel): TaskModel[] {
    const workflowDef = workflow.workflowDefinition;
    if (!workflowDef) return [];

    if (
      this.systemTaskRegistry.isSystemTask(task.taskType) &&
      (task.taskType === 'DECISION' || task.taskType === 'SWITCH')
    ) {
      if (task.inputData['hasChildren'] != null) {
        return [];
      }
    }

    const taskReferenceName = task.loopOverTask
      ? removeIterationFromTaskRefName(task.referenceTaskName)
      : task.referenceTaskName;

    let taskToSchedule = getNextTask(workflowDef, taskReferenceName);
    while (taskToSchedule && this.isTaskSkipped(taskToSchedule, workflow)) {
      taskToSchedule = getNextTask(workflowDef, taskToSchedule.taskReferenceName);
    }

    if (taskToSchedule && taskToSchedule.type === 'DO_WHILE') {
      const nextRef = taskToSchedule.taskReferenceName;
      if (
        workflow.tasks.some((t) => t.referenceTaskName === nextRef)
      ) {
        return [];
      }
    }

    if (taskToSchedule) {
      return this.getTasksToBeScheduled(workflow, taskToSchedule, 0);
    }

    return [];
  }

  private getNextTasksToBeScheduled(
    workflow: WorkflowModel,
    task: TaskModel,
  ): string | null {
    const def = workflow.workflowDefinition;
    if (!def) return null;

    const taskReferenceName = task.referenceTaskName;
    let taskToSchedule = getNextTask(def, taskReferenceName);
    while (taskToSchedule && this.isTaskSkipped(taskToSchedule, workflow)) {
      taskToSchedule = getNextTask(def, taskToSchedule.taskReferenceName);
    }
    return taskToSchedule?.taskReferenceName ?? null;
  }

  private retry(
    taskDefinition: TaskDef | null,
    workflowTask: WorkflowTask | null,
    task: TaskModel,
    workflow: WorkflowModel,
  ): TaskModel | null {
    const retryCount = task.retryCount;

    if (!taskDefinition) {
      taskDefinition = task.taskDefinition ?? null;
    }

    const expectedRetryCount =
      taskDefinition?.retryCount ?? workflowTask?.retryCount ?? 0;

    if (
      !isTaskRetriable(task.status) ||
      isBuiltInTask(task.taskType) ||
      expectedRetryCount <= retryCount
    ) {
      if (workflowTask != null && (workflowTask.optional || workflowTask.permissive)) {
        return null;
      }

      let status: string;
      switch (task.status) {
        case 'CANCELED':
          status = 'TERMINATED';
          break;
        case 'TIMED_OUT':
          status = 'TIMED_OUT';
          break;
        default:
          status = 'FAILED';
          break;
      }
      this.updateWorkflowOutput(workflow, task);
      const errMsg = `Task ${task.taskId} failed with status: ${status} and reason: '${task.reasonForIncompletion}'`;
      throw new TerminateWorkflowError(errMsg, status);
    }

    if (
      taskDefinition != null &&
      taskDefinition.totalTimeoutSeconds > 0 &&
      task.firstScheduledTime > 0
    ) {
      const totalElapsedSeconds = (Date.now() - task.firstScheduledTime) / 1000;
      if (totalElapsedSeconds >= taskDefinition.totalTimeoutSeconds) {
        const errMsg = `Task ${task.taskId}/${task.taskDefName} exceeded total timeout of ${taskDefinition.totalTimeoutSeconds} seconds (elapsed ${totalElapsedSeconds} seconds across all attempts). No further retries will be attempted.`;
        const totalTimeoutStatus =
          task.status === 'TIMED_OUT' ? 'TIMED_OUT' : 'FAILED';
        this.updateWorkflowOutput(workflow, task);
        throw new TerminateWorkflowError(errMsg, totalTimeoutStatus);
      }
    }

    let startDelay = taskDefinition?.retryDelaySeconds ?? 0;
    const retryLogic = taskDefinition?.retryLogic;

    switch (retryLogic) {
      case 'LINEAR_BACKOFF': {
        const linearDelay =
          (taskDefinition?.retryDelaySeconds ?? 0) *
          (taskDefinition?.backoffScaleFactor ?? 1) *
          (task.retryCount + 1);
        startDelay = linearDelay < 0 ? 2147483647 : linearDelay;
        startDelay = applyMaxRetryDelayCap(startDelay, taskDefinition);
        break;
      }
      case 'EXPONENTIAL_BACKOFF': {
        const expDelay =
          (taskDefinition?.retryDelaySeconds ?? 0) * Math.pow(2, task.retryCount);
        startDelay = expDelay < 0 ? 2147483647 : expDelay;
        startDelay = applyMaxRetryDelayCap(startDelay, taskDefinition);
        break;
      }
      default:
        startDelay = applyMaxRetryDelayCap(startDelay, taskDefinition);
        break;
    }

    task.retried = true;

    const jitterMs =
      taskDefinition != null && (taskDefinition.backoffJitterMs ?? 0) > 0
        ? Math.floor(Math.random() * ((taskDefinition.backoffJitterMs ?? 0) + 1))
        : 0;

    const totalDelayMs = startDelay * 1000 + jitterMs;

    const rescheduled = copyTaskModel(task);
    rescheduled.startDelayInSeconds = startDelay;
    rescheduled.callbackAfterSeconds = startDelay;
    rescheduled.callbackAfterMs = totalDelayMs;
    rescheduled.retryCount = task.retryCount + 1;
    rescheduled.retried = false;
    rescheduled.taskId = generateId();
    rescheduled.retriedTaskId = task.taskId;
    rescheduled.status = 'SCHEDULED';
    rescheduled.pollCount = 0;
    rescheduled.inputData = workflowTask
      ? resolveTaskInput(workflowTask.inputParameters ?? {}, workflow, rescheduled.taskId)
      : { ...task.inputData };
    rescheduled.reasonForIncompletion = task.reasonForIncompletion;
    rescheduled.subWorkflowId = null;
    rescheduled.seq = 0;
    rescheduled.scheduledTime = 0;
    rescheduled.startTime = 0;
    rescheduled.endTime = 0;
    rescheduled.workerId = null;
    rescheduled.updateTime = 0;
    rescheduled.outputData = {};
    rescheduled.externalOutputPayloadStoragePath = null;
    rescheduled.outputMessage = null;

    return rescheduled;
  }

  checkWorkflowTimeout(workflow: WorkflowModel): void {
    const workflowDef = workflow.workflowDefinition;
    if (!workflowDef) return;

    if (isWorkflowTerminal(workflow.status) || (workflowDef.timeoutSeconds ?? 0) <= 0) return;

    const timeout = 1000 * (workflowDef.timeoutSeconds ?? 0);
    const now = Date.now();
    const elapsedTime =
      workflow.lastRetriedTime > 0
        ? now - workflow.lastRetriedTime
        : now - workflow.createTime;

    if (elapsedTime < timeout) return;

    const reason =
      `Workflow timed out after ${Math.floor(elapsedTime / 1000)} seconds. ` +
      `Timeout configured as ${workflowDef.timeoutSeconds} seconds. ` +
      `Timeout policy configured to ${workflowDef.timeoutPolicy}`;

    if (workflowDef.timeoutPolicy === 'TIME_OUT_WF') {
      throw new TerminateWorkflowError(reason, 'TIMED_OUT');
    }
  }

  private checkTotalTimeout(taskDef: TaskDef, task: TaskModel): void {
    if (
      !taskDef ||
      (taskDef.totalTimeoutSeconds ?? 0) <= 0 ||
      isTaskTerminal(task.status) ||
      task.firstScheduledTime <= 0
    ) {
      return;
    }

    const totalElapsedSeconds = (Date.now() - task.firstScheduledTime) / 1000;
    if (totalElapsedSeconds < (taskDef.totalTimeoutSeconds ?? 0)) return;

    const reason =
      `Task ${task.taskDefName}/${task.taskId} exceeded total timeout of ${taskDef.totalTimeoutSeconds} seconds ` +
      `(elapsed ${totalElapsedSeconds} seconds across all attempts including retry delays). ` +
      `Timeout policy: ${taskDef.timeoutPolicy}`;
    this.timeoutTaskWithTimeoutPolicy(reason, taskDef, task);
  }

  private checkTaskTimeout(taskDef: TaskDef, task: TaskModel): void {
    if (
      !taskDef ||
      isTaskTerminal(task.status) ||
      (taskDef.timeoutSeconds ?? 0) <= 0 ||
      task.startTime <= 0
    ) {
      return;
    }

    const timeout = 1000 * (taskDef.timeoutSeconds ?? 0);
    const now = Date.now();
    const elapsedTime =
      now - (task.startTime + task.startDelayInSeconds * 1000);

    if (elapsedTime < timeout) return;

    const reason =
      `Task timed out after ${Math.floor(elapsedTime / 1000)} seconds. ` +
      `Timeout configured as ${taskDef.timeoutSeconds} seconds. ` +
      `Timeout policy configured to ${taskDef.timeoutPolicy}`;
    this.timeoutTaskWithTimeoutPolicy(reason, taskDef, task);
  }

  private checkTaskPollTimeout(taskDef: TaskDef, task: TaskModel): void {
    if (
      !taskDef ||
      (taskDef.pollTimeoutSeconds ?? 0) <= 0 ||
      task.status !== 'SCHEDULED'
    ) {
      return;
    }

    const pollTimeout = 1000 * (taskDef.pollTimeoutSeconds ?? 0);
    const adjustedPollTimeout = pollTimeout + task.callbackAfterSeconds * 1000;
    const now = Date.now();
    const pollElapsedTime =
      now - (task.scheduledTime + task.startDelayInSeconds * 1000);

    if (pollElapsedTime < adjustedPollTimeout) return;

    const reason =
      `Task poll timed out after ${Math.floor(pollElapsedTime / 1000)} seconds. ` +
      `Poll timeout configured as ${pollTimeout / 1000} seconds. ` +
      `Timeout policy configured to ${taskDef.timeoutPolicy}`;
    this.timeoutTaskWithTimeoutPolicy(reason, taskDef, task);
  }

  private timeoutTaskWithTimeoutPolicy(
    reason: string,
    taskDef: TaskDef,
    task: TaskModel,
  ): void {
    switch (taskDef.timeoutPolicy) {
      case 'ALERT_ONLY':
        return;
      case 'RETRY':
        task.status = 'TIMED_OUT';
        task.reasonForIncompletion = reason;
        return;
      case 'TIME_OUT_WF':
        task.status = 'TIMED_OUT';
        task.reasonForIncompletion = reason;
        throw new TerminateWorkflowError(reason, 'TIMED_OUT', task);
    }
  }

  private isResponseTimedOut(taskDefinition: TaskDef, task: TaskModel): boolean {
    if (!taskDefinition) return false;
    if (isTaskTerminal(task.status) || this.isAsyncCompleteSystemTask(task)) {
      return false;
    }

    const now = Date.now();
    const callbackTime = 1000 * task.callbackAfterSeconds;
    const referenceTime = task.updateTime > 0 ? task.updateTime : task.scheduledTime;
    const pendingTime = now - (referenceTime + callbackTime);

    if (
      task.status !== 'IN_PROGRESS' ||
      (taskDefinition.responseTimeoutSeconds ?? 0) === 0
    ) {
      return false;
    }

    const responseTimeout = 1000 * (taskDefinition.responseTimeoutSeconds ?? 0);
    const adjustedResponseTimeout = responseTimeout + callbackTime;
    const noResponseTime = now - task.updateTime;

    return noResponseTime >= adjustedResponseTimeout;
  }

  private timeoutTask(taskDef: TaskDef, task: TaskModel): void {
    const reason = `responseTimeout: ${taskDef.responseTimeoutSeconds} exceeded for the taskId: ${task.taskId} with Task Definition: ${task.taskDefName}`;
    task.status = 'TIMED_OUT';
    task.reasonForIncompletion = reason;
  }

  getTasksToBeScheduled(
    workflow: WorkflowModel,
    taskToSchedule: WorkflowTask,
    retryCount: number,
    retriedTaskId?: string,
  ): TaskModel[] {
    const type = taskToSchedule.type;

    const tasksInWorkflow = new Set(
      workflow.tasks
        .filter(
          (t) =>
            t.status === 'IN_PROGRESS' || isTaskTerminal(t.status),
        )
        .map((t) => t.referenceTaskName),
    );

    const taskId = generateId();
    const resolvedInput = resolveTaskInput(taskToSchedule.inputParameters ?? {}, workflow, taskId);
    const taskMapperContext = new TaskMapperContext({
      workflowModel: workflow,
      taskDefinition: taskToSchedule.taskDefinition ?? null,
      workflowTask: taskToSchedule,
      taskInput: resolvedInput,
      retryCount,
      retryTaskId: retriedTaskId ?? null,
      taskId,
      deciderService: this,
    });

    const mapper = this.taskMappers.get(type) ?? this.taskMappers.get('USER_DEFINED');
    if (!mapper) {
      return [];
    }

    return mapper.getMappedTasks(taskMapperContext).filter(
      (task) => !tasksInWorkflow.has(task.referenceTaskName),
    );
  }

  private getTaskDefFromWorkflow(
    task: TaskModel,
    workflow: WorkflowModel,
  ): TaskDef | null {
    const wft = task.workflowTask;
    if (wft?.taskDefinition) {
      return wft.taskDefinition;
    }
    const resolved = workflow.workflowDefinition
      ? getTaskByRefName(workflow.workflowDefinition, task.referenceTaskName)
      : null;
    return resolved?.taskDefinition ?? null;
  }

  private isTaskSkipped(
    taskToSchedule: WorkflowTask | null,
    workflow: WorkflowModel,
  ): boolean {
    if (!taskToSchedule) return false;
    const t = workflow.tasks.find(
      (x) => x.referenceTaskName === taskToSchedule.taskReferenceName,
    );
    return t?.status === 'SKIPPED';
  }

  private isAsyncCompleteSystemTask(task: TaskModel): boolean {
    return (
      this.systemTaskRegistry.isSystemTask(task.taskType) &&
      this.systemTaskRegistry.get(task.taskType).isAsyncComplete(task)
    );
  }
}

export class TerminateWorkflowError extends Error {
  workflowStatus: string;
  task: TaskModel | null;

  constructor(message: string, workflowStatus?: string, task?: TaskModel) {
    super(message);
    this.name = 'TerminateWorkflowError';
    this.workflowStatus = workflowStatus ?? 'FAILED';
    this.task = task ?? null;
  }
}

function applyMaxRetryDelayCap(
  delaySeconds: number,
  taskDef: TaskDef | null | undefined,
): number {
  const cap = taskDef?.maxRetryDelaySeconds ?? 0;
  return cap > 0 && delaySeconds > cap ? cap : delaySeconds;
}

function generateId(): string {
  return `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function isWorkflowTerminal(status: string): boolean {
  return (
    status === 'COMPLETED' ||
    status === 'FAILED' ||
    status === 'TIMED_OUT' ||
    status === 'TERMINATED'
  );
}

function appendIteration(refName: string, iteration: number): string {
  return `${refName}_${iteration}`;
}

function removeIterationFromTaskRefName(refName: string): string {
  const idx = refName.lastIndexOf('_');
  if (idx > 0) {
    const suffix = refName.substring(idx + 1);
    if (/^\d+$/.test(suffix)) {
      return refName.substring(0, idx);
    }
  }
  return refName;
}

function resolveTemplate(
  params: Record<string, unknown>,
  workflow: WorkflowModel,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string' && val.includes('${')) {
      result[key] = val;
    } else {
      result[key] = val;
    }
  }
  return result;
}
