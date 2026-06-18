import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@conductor/common';

const WORKFLOW_ID = 'workflowId';
const START_WORKFLOW_PARAMETER = 'startWorkflow';

export class StartWorkflow extends WorkflowSystemTask {
  constructor() {
    super(TaskType.START_WORKFLOW);
  }

  override start(
    workflow: WorkflowModel,
    taskModel: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): void {
    const request = this.getRequest(taskModel);
    if (!request) return;

    if (!request.taskToDomain || Object.keys(request.taskToDomain).length === 0) {
      if (workflow.taskToDomain) {
        request.taskToDomain = { ...workflow.taskToDomain };
      }
    }

    request.correlationId = request.correlationId || workflow.correlationId || undefined;

    try {
      const workflowId = workflowExecutor.startWorkflow({
        name: request.name,
        version: request.version,
        workflowInput: request.input,
        correlationId: request.correlationId,
        taskToDomain: request.taskToDomain,
      });
      taskModel.outputData[WORKFLOW_ID] = workflowId;
      taskModel.status = 'COMPLETED';
    } catch (ae) {
      taskModel.status = 'FAILED';
      taskModel.reasonForIncompletion = (ae as Error).message;
    }
  }

  override isAsync(): boolean {
    return true;
  }

  private getRequest(taskModel: TaskModel): StartWorkflowRequest | null {
    const taskInput = taskModel.inputData;

    if (taskInput[START_WORKFLOW_PARAMETER] == null) {
      taskModel.status = 'FAILED';
      taskModel.reasonForIncompletion = `Missing '${START_WORKFLOW_PARAMETER}' in input data.`;
      return null;
    }

    const raw = taskInput[START_WORKFLOW_PARAMETER] as Record<string, unknown>;
    const request: StartWorkflowRequest = {
      name: String(raw['name'] ?? ''),
      version: raw['version'] != null ? Number(raw['version']) : undefined,
      input: raw['input'] as Record<string, unknown> | undefined,
      correlationId: raw['correlationId'] as string | undefined,
      taskToDomain: raw['taskToDomain'] as Record<string, string> | undefined,
    };

    if (!request.name) {
      taskModel.status = 'FAILED';
      taskModel.reasonForIncompletion = 'StartWorkflowRequest name is required';
      return null;
    }

    return request;
  }
}

interface StartWorkflowRequest {
  name: string;
  version?: number;
  input?: Record<string, unknown>;
  correlationId?: string;
  taskToDomain?: Record<string, string>;
}
