import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@conductor/common';

export class SwitchTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.SWITCH;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const tasksToBeScheduled: TaskModel[] = [];
    const workflowTask = taskMapperContext.workflowTask;
    const workflowModel = taskMapperContext.workflowModel;
    const taskInput = taskMapperContext.taskInput;
    const retryCount = taskMapperContext.retryCount;

    const evaluatorType = workflowTask.evaluatorType ?? 'javascript';
    const expression = workflowTask.expression ?? '';

    let evalResult = '';
    try {
      evalResult = String(this.evaluate(evaluatorType, expression, taskInput, workflowTask.caseValueParam));
    } catch (exception) {
      const switchTask = taskMapperContext.createTaskModel();
      switchTask.taskType = workflowTask.type;
      switchTask.taskDefName = workflowTask.name;
      switchTask.inputData = { ...taskInput };
      switchTask.startTime = Date.now();
      switchTask.status = 'FAILED';
      switchTask.reasonForIncompletion = (exception as Error).message;
      tasksToBeScheduled.push(switchTask);
      return tasksToBeScheduled;
    }

    const switchTask = taskMapperContext.createTaskModel();
    switchTask.taskType = workflowTask.type;
    switchTask.taskDefName = workflowTask.name;
    switchTask.inputData = { ...taskInput, case: evalResult };
    switchTask.outputData['evaluationResult'] = [evalResult];
    switchTask.outputData['selectedCase'] = evalResult;
    switchTask.startTime = Date.now();
    switchTask.status = 'IN_PROGRESS';
    tasksToBeScheduled.push(switchTask);

    let selectedTasks = workflowTask.decisionCases?.[evalResult] ?? null;
    if (selectedTasks == null) {
      selectedTasks = workflowTask.defaultCase ?? null;
    }

    if (selectedTasks != null && selectedTasks.length > 0) {
      const selectedTask = selectedTasks[0];
      if (!selectedTask) return tasksToBeScheduled;
      const caseTasks = taskMapperContext.deciderService.getTasksToBeScheduled(
        workflowModel,
        selectedTask,
        retryCount,
        taskMapperContext.retryTaskId ?? undefined,
      );
      tasksToBeScheduled.push(...caseTasks);
      switchTask.inputData['hasChildren'] = 'true';
    }

    return tasksToBeScheduled;
  }

  private evaluate(
    evaluatorType: string,
    expression: string,
    input: Record<string, unknown>,
    caseValueParam?: string,
  ): unknown {
    if (caseValueParam) {
      return input[caseValueParam];
    }
    if (evaluatorType === 'value-param') {
      return input[expression];
    }
    if (evaluatorType === 'javascript') {
      try {
        const fn = new Function('$', `"use strict"; return (${expression});`);
        return fn(input);
      } catch (err) {
        // Fallback: if $ is not defined, we can try with input variables
        const keys = Object.keys(input);
        const vals = Object.values(input);
        const fn = new Function(...keys, `"use strict"; return (${expression});`);
        return fn(...vals);
      }
    }
    return input[expression];
  }
}

