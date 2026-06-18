import { WorkflowSystemTask } from '@agentmesh/core';
import type { WorkflowModel, TaskModel, WorkflowExecutor } from '@agentmesh/core';
import { LLMs } from '../LLMs.js';
import { EmbeddingGenRequest } from '../models/index.js';
import { TaskStatus } from '@agentmesh/common';
import { ModelClient } from '../routing/ModelClient.js';
import { TelemetryService, Span } from '@agentmesh/telemetry';

export class LlmGenerateEmbeddings extends WorkflowSystemTask {
  public static readonly NAME = 'LLM_GENERATE_EMBEDDINGS';

  constructor(
    private readonly llms: LLMs,
    private readonly modelClient: ModelClient,
    private readonly telemetryService?: TelemetryService,
  ) {
    super(LlmGenerateEmbeddings.NAME);
  }

  override start(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): void {
    task.status = TaskStatus.IN_PROGRESS;
  }

  async executeAsync(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): Promise<void> {
    const doExecute = async (span?: Span) => {
      try {
        const inputData = task.inputData as unknown as EmbeddingGenRequest;

        const aiModel = this.modelClient.route(inputData as any);
        inputData.llmProvider = aiModel.getModelProvider();

        const response = await this.llms.generateEmbeddings(
          {
            taskId: task.taskId,
            workflowInstanceId: workflow.workflowId,
          },
          inputData,
        );

        task.outputData = {
          embeddings: response,
        };
        task.status = TaskStatus.COMPLETED;
      } catch (e: any) {
        task.status = TaskStatus.FAILED;
        task.reasonForIncompletion = e.message;
        if (span) {
          span.setAttribute('error.message', e.message);
        }
      }
    };

    if (this.telemetryService) {
      await this.telemetryService.traceAsync(
        'LlmGenerateEmbeddings.execute',
        {
          agentId: String((task.inputData as any)?.agentId || 'unknown'),
          tenantId: String((task.inputData as any)?.tenantId || 'unknown'),
          taskId: String(task.taskId),
          workflowId: String(workflow.workflowId),
        },
        doExecute,
      );
    } else {
      await doExecute();
    }
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    return false;
  }

  override isAsync(): boolean {
    return true;
  }
}
