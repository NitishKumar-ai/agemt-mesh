import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType, isTaskSuccessful, isTaskTerminal } from '@agentmesh/common';
import { removeIterationFromTaskRefName, appendIteration, workflowTaskHas, workflowTaskNext } from '../ExecutorUtils.js';

export class DoWhile extends WorkflowSystemTask {
  constructor() {
    super(TaskType.DO_WHILE);
  }

  override cancel(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): void {
    task.status = 'CANCELED';
  }

  override execute(
    workflow: WorkflowModel,
    doWhileTaskModel: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    let hasFailures = false;
    const failureReason: string[] = [];
    const output: Record<string, unknown> = {};

    const relevantTasks = new Map<string, TaskModel>();
    for (const t of workflow.tasks) {
      const refWithoutIteration = removeIterationFromTaskRefName(t.referenceTaskName);
      if (
        doWhileTaskModel.workflowTask &&
        workflowTaskHas(doWhileTaskModel.workflowTask, refWithoutIteration) &&
        doWhileTaskModel.referenceTaskName !== t.referenceTaskName &&
        doWhileTaskModel.iteration === t.iteration
      ) {
        const existing = relevantTasks.get(t.referenceTaskName);
        if (!existing || t.retryCount > existing.retryCount) {
          relevantTasks.set(t.referenceTaskName, t);
        }
      }
    }

    const loopOverTasks = Array.from(relevantTasks.values());

    if (loopOverTasks.length === 0) {
      if (this.isListIteration(doWhileTaskModel)) {
        const itemsList = this.evaluateItemsList(workflow, doWhileTaskModel);
        if (itemsList.length === 0) {
          doWhileTaskModel.outputData['iteration'] = 0;
          return this.markTaskSuccess(doWhileTaskModel);
        }
      }

      doWhileTaskModel.iteration = 1;
      doWhileTaskModel.outputData['iteration'] = doWhileTaskModel.iteration;
      this.injectLoopVariables(workflow, doWhileTaskModel);
      return this.scheduleNextIteration(doWhileTaskModel, workflow, workflowExecutor);
    }

    for (const loopOverTask of loopOverTasks) {
      const taskStatus = loopOverTask.status;
      hasFailures = !isTaskSuccessful(taskStatus);
      if (hasFailures) {
        failureReason.push(loopOverTask.reasonForIncompletion ?? '');
      }
      output[removeIterationFromTaskRefName(loopOverTask.referenceTaskName)] =
        loopOverTask.outputData;
      if (hasFailures) break;
    }
    doWhileTaskModel.outputData[String(doWhileTaskModel.iteration)] = output;

    const keepLastN =
      doWhileTaskModel.workflowTask?.inputParameters?.['keepLastN'] as number | undefined;
    if (keepLastN != null && doWhileTaskModel.iteration > keepLastN) {
      this.removeIterations(workflow, doWhileTaskModel, keepLastN);
    }

    if (hasFailures) {
      return this.markTaskFailure(doWhileTaskModel, 'FAILED', failureReason.join(' '));
    }

    if (!this.isIterationComplete(doWhileTaskModel, relevantTasks)) {
      return false;
    }

    let shouldContinue: boolean;
    try {
      shouldContinue = this.evaluateCondition(workflow, doWhileTaskModel);
      if (shouldContinue) {
        doWhileTaskModel.iteration += 1;
        doWhileTaskModel.outputData['iteration'] = doWhileTaskModel.iteration;
        this.injectLoopVariables(workflow, doWhileTaskModel);
        return this.scheduleNextIteration(doWhileTaskModel, workflow, workflowExecutor);
      } else {
        return this.markTaskSuccess(doWhileTaskModel);
      }
    } catch (e) {
      const message = `Unable to evaluate condition ${doWhileTaskModel.workflowTask?.loopCondition}, exception ${(e as Error).message}`;
      return this.markTaskFailure(doWhileTaskModel, 'FAILED_WITH_TERMINAL_ERROR', message);
    }
  }

  private removeIterations(
    workflow: WorkflowModel,
    doWhileTaskModel: TaskModel,
    keepLastN: number,
  ): void {
    const currentIteration = doWhileTaskModel.iteration;
    const iterationsToRemove = currentIteration - keepLastN;
    if (iterationsToRemove <= 0) return;

    const tasksToRemove = workflow.tasks.filter((task) => {
      const refWithoutIteration = removeIterationFromTaskRefName(task.referenceTaskName);
      const belongsToLoop =
        doWhileTaskModel.workflowTask != null &&
        workflowTaskHas(doWhileTaskModel.workflowTask, refWithoutIteration) &&
        doWhileTaskModel.referenceTaskName !== task.referenceTaskName;
      return belongsToLoop && task.iteration <= iterationsToRemove;
    });

    for (const taskToRemove of tasksToRemove) {
      const idx = workflow.tasks.findIndex((t) => t.taskId === taskToRemove.taskId);
      if (idx >= 0) {
        workflow.tasks.splice(idx, 1);
      }
    }
  }

  private isIterationComplete(
    doWhileTaskModel: TaskModel,
    referenceNameToModel: Map<string, TaskModel>,
  ): boolean {
    const loopOver = doWhileTaskModel.workflowTask?.loopOver ?? [];
    const iteration = doWhileTaskModel.iteration;

    for (const wft of loopOver) {
      const taskRefName = appendIteration(wft.taskReferenceName, iteration);
      const taskModel = referenceNameToModel.get(taskRefName);
      if (!taskModel || !isTaskTerminal(taskModel.status)) {
        return false;
      }
    }

    for (const taskModel of referenceNameToModel.values()) {
      if (!isTaskTerminal(taskModel.status)) {
        return false;
      }
    }

    const doWhileRef = doWhileTaskModel.workflowTask?.taskReferenceName ?? '';
    for (const task of referenceNameToModel.values()) {
      if (isTaskTerminal(task.status)) {
        const refWithoutIteration = removeIterationFromTaskRefName(task.referenceTaskName);
        const wft = doWhileTaskModel.workflowTask;
        const nextWorkflowTask = wft ? workflowTaskNext(wft, refWithoutIteration) : null;
        if (
          nextWorkflowTask != null &&
          nextWorkflowTask.taskReferenceName !== doWhileRef &&
          (wft ? workflowTaskHas(wft, nextWorkflowTask.taskReferenceName) : false)
        ) {
          const nextRef = appendIteration(nextWorkflowTask.taskReferenceName, iteration);
          if (!referenceNameToModel.has(nextRef)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private scheduleNextIteration(
    doWhileTaskModel: TaskModel,
    workflow: WorkflowModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    workflowExecutor.scheduleNextIteration(doWhileTaskModel, workflow);
    return true;
  }

  private markTaskFailure(taskModel: TaskModel, status: TaskModel['status'], failureReason: string): boolean {
    taskModel.reasonForIncompletion = failureReason;
    taskModel.status = status;
    return true;
  }

  private markTaskSuccess(taskModel: TaskModel): boolean {
    taskModel.status = 'COMPLETED';
    return true;
  }

  private injectLoopVariables(workflow: WorkflowModel, doWhileTask: TaskModel): void {
    if (!this.isListIteration(doWhileTask)) return;

    const itemsList = this.evaluateItemsList(workflow, doWhileTask);
    const currentIteration = doWhileTask.iteration;
    const loopIndex = currentIteration - 1;

    doWhileTask.outputData['loopIndex'] = loopIndex;

    if (loopIndex >= 0 && loopIndex < itemsList.length) {
      doWhileTask.outputData['loopItem'] = itemsList[loopIndex];
    }
  }

  private isListIteration(task: TaskModel): boolean {
    const items = task.workflowTask?.items;
    if (items != null && items.trim().length > 0) {
      return true;
    }

    const inputParams = task.workflowTask?.inputParameters;
    if (inputParams?.['_items'] != null) {
      const itemsValue = inputParams['_items'];
      return (
        itemsValue != null &&
        (typeof itemsValue === 'string' ||
          Array.isArray(itemsValue) ||
          itemsValue instanceof Set)
      );
    }

    return false;
  }

  private evaluateItemsList(workflow: WorkflowModel, task: TaskModel): unknown[] {
    let itemsValue: unknown = null;

    const itemsParam = task.workflowTask?.items;
    if (itemsParam != null && itemsParam.trim().length > 0) {
      itemsValue = task.inputData['items'] ?? itemsParam;
    }

    if (itemsValue == null) {
      const inputParams = task.workflowTask?.inputParameters;
      if (inputParams?.['_items'] != null) {
        itemsValue = inputParams['_items'];
      }
    }

    if (Array.isArray(itemsValue)) return itemsValue;
    if (itemsValue instanceof Set) return Array.from(itemsValue);
    if (itemsValue != null) return [itemsValue];

    return [];
  }

  private evaluateCondition(workflow: WorkflowModel, task: TaskModel): boolean {
    if (this.isListIteration(task)) {
      const itemsList = this.evaluateItemsList(workflow, task);
      const currentIteration = task.iteration;
      const loopIndex = currentIteration - 1;
      const hasMoreItems = loopIndex < itemsList.length - 1;

      const condition = task.workflowTask?.loopCondition;
      if (condition != null && condition.trim().length > 0) {
        return ScriptEvaluator.evalBool(condition, {
          ...workflow.input,
          loopIndex,
          loopItem: loopIndex >= 0 && loopIndex < itemsList.length ? itemsList[loopIndex] : undefined,
        }) && hasMoreItems;
      }

      return hasMoreItems;
    }

    const condition = task.workflowTask?.loopCondition;
    if (condition != null) {
      return ScriptEvaluator.evalBool(condition, {
        ...workflow.input,
        [task.referenceTaskName]: task.outputData,
      });
    }
    return false;
  }
}

class ScriptEvaluator {
  static evalBool(expression: string, context: Record<string, unknown>): boolean {
    try {
      const keys = Object.keys(context);
      const vals = Object.values(context);
      const fn = new Function(...keys, `"use strict"; return Boolean(${expression});`);
      return fn(...vals);
    } catch {
      return false;
    }
  }
}
