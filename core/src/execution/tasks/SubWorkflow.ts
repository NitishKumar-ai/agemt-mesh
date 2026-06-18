import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType, isTaskTerminal, isWorkflowTerminal, isWorkflowSuccessful } from '@agentmesh/common';

const SUB_WORKFLOW_ID = 'subWorkflowId';
const SUB_WORKFLOW_LAUNCH_ERROR = 'subWorkflowLaunchError';

export class SubWorkflow extends WorkflowSystemTask {
  constructor() {
    super(TaskType.SUB_WORKFLOW);
  }

  override start(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    if (task.status !== 'SCHEDULED') {
      return;
    }

    const input = task.inputData;
    const versionObj = input['subWorkflowVersion'];
    const resolvedVersion = typeof versionObj === 'number' ? (versionObj === 0 ? null : versionObj) : null;

    let name: string | null = null;
    if (input['subWorkflowDefinition'] != null) {
      name = (input['subWorkflowDefinition'] as Record<string, unknown>)['name'] as string ?? null;
    }
    if (name == null) {
      name = input['subWorkflowName'] != null ? String(input['subWorkflowName']) : null;
    }
    if (name == null) {
      task.status = 'FAILED';
      task.reasonForIncompletion = 'SubWorkflow name is null and no workflowDefinition supplied';
      return;
    }

    let taskToDomain = workflow.taskToDomain ?? undefined;
    if (input['subWorkflowTaskToDomain'] instanceof Map || typeof input['subWorkflowTaskToDomain'] === 'object') {
      taskToDomain = input['subWorkflowTaskToDomain'] as Record<string, string> | undefined;
    }

    let wfInput = input['workflowInput'] as Record<string, unknown> | null;
    if (wfInput == null || Object.keys(wfInput).length === 0) {
      wfInput = input;
    }

    const priority = typeof input['priority'] === 'number' ? input['priority'] as number : undefined;

    const parentWorkflowId = task.workflowInstanceId;
    const subWorkflowId = generateSubWorkflowId(parentWorkflowId, task.taskId, task.retryCount);

    try {
      const subWorkflow = workflowExecutor.startWorkflowIdempotent({
        workflowDefinition: input['subWorkflowDefinition'] as Record<string, unknown> | null,
        name,
        version: resolvedVersion ?? undefined,
        workflowInput: wfInput,
        correlationId: workflow.correlationId ?? undefined,
        parentWorkflowId,
        parentWorkflowTaskId: task.taskId,
        taskToDomain,
        workflowId: subWorkflowId,
        priority,
      });

      task.reasonForIncompletion = null;
      task.subWorkflowId = subWorkflow.workflowId;
      task.outputData[SUB_WORKFLOW_ID] = subWorkflow.workflowId;

      const subWorkflowStatus = subWorkflow.status;
      switch (subWorkflowStatus) {
        case 'RUNNING':
        case 'PAUSED':
          task.status = 'IN_PROGRESS';
          break;
        case 'COMPLETED':
          task.status = 'COMPLETED';
          break;
        case 'FAILED':
          task.status = 'FAILED';
          break;
        case 'TERMINATED':
          task.status = 'CANCELED';
          break;
        case 'TIMED_OUT':
          task.status = 'TIMED_OUT';
          break;
      }
    } catch (e) {
      task.status = 'FAILED';
      task.reasonForIncompletion = (e as Error).message;
    }
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const workflowId = task.subWorkflowId;
    if (!workflowId) {
      if (task.status === 'SCHEDULED') {
        this.start(workflow, task, workflowExecutor);
        return task.subWorkflowId != null || isTaskTerminal(task.status);
      }
      return false;
    }

    const subWorkflow = workflowExecutor.getWorkflow(workflowId, false);
    if (!subWorkflow) {
      return false;
    }

    const subWorkflowStatus = subWorkflow.status;
    if (!isWorkflowTerminal(subWorkflowStatus)) {
      return false;
    }

    this.updateTaskStatus(subWorkflow, task);
    return true;
  }

  override cancel(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    const workflowId = task.subWorkflowId;
    if (!workflowId) {
      return;
    }

    const subWorkflow = workflowExecutor.getWorkflow(workflowId, true);
    if (!subWorkflow) return;

    subWorkflow.status = 'TERMINATED';
    const reason = workflow.reasonForIncompletion
      ? `Parent workflow has been terminated with reason: ${workflow.reasonForIncompletion}`
      : `Parent workflow has been terminated with status ${workflow.status}`;
    workflowExecutor.terminateWorkflow(subWorkflow.workflowId, reason);
  }

  override isAsyncComplete(task: TaskModel): boolean {
    return true;
  }

  override isAsync(): boolean {
    return true;
  }

  override isTaskRetrievalRequired(): boolean {
    return false;
  }

  private updateTaskStatus(subworkflow: WorkflowModel, task: TaskModel): void {
    const status = subworkflow.status;
    switch (status) {
      case 'RUNNING':
      case 'PAUSED':
        task.status = 'IN_PROGRESS';
        break;
      case 'COMPLETED':
        task.status = 'COMPLETED';
        break;
      case 'FAILED':
        task.status = 'FAILED';
        break;
      case 'TERMINATED':
        task.status = 'CANCELED';
        break;
      case 'TIMED_OUT':
        task.status = 'TIMED_OUT';
        break;
    }

    if (isWorkflowTerminal(status)) {
      task.outputData = { ...subworkflow.output };
      if (!isWorkflowSuccessful(status)) {
        task.reasonForIncompletion = `Sub workflow ${subworkflow.workflowId} failure reason: ${subworkflow.reasonForIncompletion}`;
      }
    }
  }
}

function generateSubWorkflowId(parentWorkflowId: string, taskId: string, retryCount: number): string {
  return `${parentWorkflowId}_${taskId}_${retryCount}`;
}
