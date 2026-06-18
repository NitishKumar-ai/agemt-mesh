import { WorkflowSystemTask } from '@agentmesh/core';
import type { WorkflowModel, TaskModel, WorkflowExecutor } from '@agentmesh/core';
import { LLMs } from '../LLMs.js';
import { ChatCompletion, LLMResponse } from '../models/index.js';
import { TaskStatus } from '@agentmesh/common';
import { ModelClient } from '../routing/ModelClient.js';
import { TelemetryService, Span } from '@agentmesh/telemetry';

export class LlmChatComplete extends WorkflowSystemTask {
  public static readonly NAME = 'LLM_CHAT_COMPLETE';

  constructor(
    private readonly llms: LLMs,
    private readonly modelClient: ModelClient,
    private readonly telemetryService?: TelemetryService,
    private readonly budgetManager?: any, // Typed as any to avoid circular deps if needed, or import from agent-runtime
  ) {
    super(LlmChatComplete.NAME);
  }

  override start(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): void {
    task.status = TaskStatus.IN_PROGRESS;
  }

  async executeAsync(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): Promise<void> {
    const doExecute = async (span?: Span) => {
      try {
        const inputData = task.inputData as any;
        
        const aiModel = this.modelClient.route(inputData);
        inputData.llmProvider = aiModel.getModelProvider();

        const response: LLMResponse = await this.llms.chatComplete({
          taskId: task.taskId,
          workflowInstanceId: workflow.workflowId,
        }, inputData);

        task.outputData = {
          ...response,
        };
        task.status = TaskStatus.COMPLETED;

        if (span && response.tokenUsed) {
          span.setAttribute('tokens.prompt', response.promptTokens || 0);
          span.setAttribute('tokens.completion', response.completionTokens || 0);
          span.setAttribute('tokens.total', response.tokenUsed);
        }

        if (this.budgetManager && response.tokenUsed) {
          const agentId = inputData.agentId;
          if (agentId) {
            // Very naive cost calculation, in reality this depends on the model
            const estimatedCostUsd = (response.tokenUsed / 1000) * 0.002;
            await this.budgetManager.recordUsage(agentId, response.tokenUsed, estimatedCostUsd);
          }
        }
      } catch (e: any) {
        task.status = TaskStatus.FAILED;
        task.reasonForIncompletion = e.message;
        if (span) {
          span.setAttribute('error.message', e.message);
        }
      }
    };

    if (this.telemetryService) {
      await this.telemetryService.traceAsync('LlmChatComplete.execute', {
        agentId: String(task.inputData?.agentId || 'unknown'),
        tenantId: String(task.inputData?.tenantId || 'unknown'),
        taskId: String(task.taskId),
        workflowId: String(workflow.workflowId),
      }, doExecute);
    } else {
      await doExecute();
    }
  }

  override execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    // We execute async and return true to let the engine know we have updated the task.
    // However, since it's an async operation, we'd normally queue it to an async executor.
    // Assuming AgentMesh's AsyncSystemTaskExecutor will handle async logic:
    // This is just a basic implementation. We'll mark it as IN_PROGRESS and handle async via Worker.
    return false; // Return false if no synchronous changes are complete
  }

  override isAsync(): boolean {
    return true; // We want this to run in the AsyncSystemTaskExecutor
  }
}
