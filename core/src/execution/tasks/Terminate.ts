import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType, WorkflowStatus } from '@agentmesh/common';

export const TERMINATION_STATUS_PARAMETER = 'terminationStatus';
export const TERMINATION_REASON_PARAMETER = 'terminationReason';
export const TERMINATION_WORKFLOW_OUTPUT = 'workflowOutput';

export class Terminate extends WorkflowSystemTask {
  constructor() {
    super(TaskType.TERMINATE);
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const returnStatus = task.inputData[TERMINATION_STATUS_PARAMETER] as string | undefined;

    if (validateInputStatus(returnStatus)) {
      task.outputData = getInputFromParam(task.inputData);
      task.status = 'COMPLETED';
      return true;
    }

    task.reasonForIncompletion = 'given termination status is not valid';
    task.status = 'FAILED';
    return false;
  }
}

export function getTerminationStatusParameter(): string {
  return TERMINATION_STATUS_PARAMETER;
}

export function getTerminationReasonParameter(): string {
  return TERMINATION_REASON_PARAMETER;
}

export function getTerminationWorkflowOutputParameter(): string {
  return TERMINATION_WORKFLOW_OUTPUT;
}

export function validateInputStatus(status: string | undefined): boolean {
  return (
    status === WorkflowStatus.COMPLETED ||
    status === WorkflowStatus.FAILED ||
    status === WorkflowStatus.TERMINATED
  );
}

function getInputFromParam(taskInput: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const workflowOutput = taskInput[TERMINATION_WORKFLOW_OUTPUT];
  if (workflowOutput == null) {
    return output;
  }
  if (workflowOutput instanceof Object && !Array.isArray(workflowOutput)) {
    Object.assign(output, workflowOutput);
    return output;
  }
  output['output'] = workflowOutput;
  return output;
}
