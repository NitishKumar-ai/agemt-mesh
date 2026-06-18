import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

export class SetVariable extends WorkflowSystemTask {
  private maxPayloadSizeKb: number;

  constructor(maxPayloadSizeKb = 5120) {
    super(TaskType.SET_VARIABLE);
    this.maxPayloadSizeKb = maxPayloadSizeKb;
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    provider: WorkflowExecutor,
  ): boolean {
    const variables = workflow.variables;
    const input = task.inputData;
    if (input != null && Object.keys(input).length > 0) {
      const previousValues = new Map<string, unknown>();
      const newKeys: string[] = [];

      for (const key of Object.keys(input)) {
        if (key in variables) {
          previousValues.set(key, variables[key]);
        } else {
          newKeys.push(key);
        }
        variables[key] = input[key];
      }

      if (!this.validateVariablesSize(workflow, task, variables)) {
        for (const [key, val] of previousValues) {
          variables[key] = val;
        }
        for (const key of newKeys) {
          delete variables[key];
        }
        task.status = 'FAILED_WITH_TERMINAL_ERROR';
        return true;
      }
    }

    task.status = 'COMPLETED';
    return true;
  }

  private validateVariablesSize(
    workflow: WorkflowModel,
    task: TaskModel,
    variables: Record<string, unknown>,
  ): boolean {
    const payloadStr = JSON.stringify(variables);
    const payloadSize = Buffer.byteLength(payloadStr, 'utf-8');
    const maxThresholdBytes = this.maxPayloadSizeKb * 1024;

    if (payloadSize > maxThresholdBytes) {
      const errorMsg = `The variables payload size: ${payloadSize} of workflow: ${workflow.workflowId} is greater than the permissible limit: ${this.maxPayloadSizeKb} kilobytes`;
      task.reasonForIncompletion = errorMsg;
      return false;
    }
    return true;
  }
}
