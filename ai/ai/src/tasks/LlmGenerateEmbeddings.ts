import { WorkflowSystemTask } from '@conductor/core';
import type { WorkflowModel, TaskModel, WorkflowExecutor } from '@conductor/core';
import { LLMs } from '../LLMs.js';
import { EmbeddingGenRequest } from '../models/index.js';
import { TaskStatus } from '@conductor/common';
import { ModelClient } from '../routing/ModelClient.js';
import { TelemetryService, Span } from '@conductor/telemetry';

export class LlmGenerateEmbeddings extends WorkflowSystemTask {
  public static readonly NAME = 'LLM_GENERATE_EMBEDDINGS';

  constructor(
    private readonly llms: LLMs,
    private readonly modelClient: ModelClient,
    private readonly telemetryService?: TelemetryService,
  ) {
    super(LlmGenerateEmbeddings.NAME);
  }

  override start(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    task.status = TaskStatus.IN_PROGRESS;
    this.executeAsync(workflow, task, workflowExecutor).catch((e) => {
      console.error(`[LlmGenerateEmbeddings] Error executing task ${task.taskId}:`, e);
    });
  }

  async executeAsync(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): Promise<void> {
    const doExecute = async (span?: Span) => {
      try {
        const inputData = task.inputData as unknown as EmbeddingGenRequest;
        
        const aiModel = this.modelClient.route(inputData as any);
        inputData.llmProvider = aiModel.getModelProvider();

        const response = await this.llms.generateEmbeddings({
          taskId: task.taskId,
          workflowInstanceId: workflow.workflowId,
        }, inputData);

        workflowExecutor.updateTask({
          workflowInstanceId: workflow.workflowId,
          taskId: task.taskId,
          outputData: {
            embeddings: response,
          },
          status: TaskStatus.COMPLETED as any,
          callbackAfterSeconds: 0,
        });
      } catch (e: any) {
        workflowExecutor.updateTask({
          workflowInstanceId: workflow.workflowId,
          taskId: task.taskId,
          status: TaskStatus.FAILED as any,
          reasonForIncompletion: e.message,
          outputData: {},
          callbackAfterSeconds: 0,
        });
        if (span) {
          span.setAttribute('error.message', e.message);
        }
      }
    };

    if (this.telemetryService) {
      await this.telemetryService.traceAsync('LlmGenerateEmbeddings.execute', {
        agentId: String((task.inputData as any)?.agentId || 'unknown'),
        tenantId: String((task.inputData as any)?.tenantId || 'unknown'),
        taskId: String(task.taskId),
        workflowId: String(workflow.workflowId),
      }, doExecute);
    } else {
      await doExecute();
    }
  }

  override execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    return false;
  }

  override isAsync(): boolean {
    return true;
  }
}
