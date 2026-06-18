import type { QueueDAO, ExecutionDAOFacade } from './WorkflowExecutorOps.js';
import type { WorkflowExecutor } from './WorkflowExecutor.js';
import type { SystemTaskRegistry } from './SystemTaskRegistry.js';
import type { WorkflowSystemTask } from './WorkflowSystemTask.js';
import { isTaskTerminal } from '@agentmesh/common';

export interface SystemTaskWorkerProperties {
  systemTaskWorkerPollInterval: number;
  systemTaskWorkerThreadCount: number;
}

export class SystemTaskWorker {
  private queueDAO: QueueDAO;
  private workflowExecutor: WorkflowExecutor;
  private systemTaskRegistry: SystemTaskRegistry;
  private executionDAOFacade: ExecutionDAOFacade;
  private properties: SystemTaskWorkerProperties;
  private running: boolean = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(params: {
    queueDAO: QueueDAO;
    workflowExecutor: WorkflowExecutor;
    systemTaskRegistry: SystemTaskRegistry;
    executionDAOFacade: ExecutionDAOFacade;
    properties: SystemTaskWorkerProperties;
  }) {
    this.queueDAO = params.queueDAO;
    this.workflowExecutor = params.workflowExecutor;
    this.systemTaskRegistry = params.systemTaskRegistry;
    this.executionDAOFacade = params.executionDAOFacade;
    this.properties = params.properties;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const systemTasks = this.systemTaskRegistry.getAll().filter((t) => t.isAsync());

    for (const task of systemTasks) {
      const queueName = task.taskType;
      const timer = setInterval(() => {
        this.pollAndExecute(task, queueName).catch(console.error);
      }, this.properties.systemTaskWorkerPollInterval);
      this.timers.push(timer);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  async pollAndExecute(systemTask: WorkflowSystemTask, queueName: string): Promise<void> {
    if (!this.running) return;
    try {
      const taskIds = await this.queueDAO.pop(
        queueName,
        this.properties.systemTaskWorkerThreadCount,
        200,
      );
      if (!taskIds || taskIds.length === 0) return;

      for (const taskId of taskIds) {
        this.executeSystemTask(systemTask, taskId).catch(console.error);
      }
    } catch (e) {
      console.error(`Error polling for system task: ${queueName}`, e);
    }
  }

  private async executeSystemTask(systemTask: WorkflowSystemTask, taskId: string): Promise<void> {
    try {
      const taskModel = this.executionDAOFacade.getTaskModel(taskId);
      if (!taskModel) {
        await this.queueDAO.remove(systemTask.taskType, taskId);
        return;
      }

      if (isTaskTerminal(taskModel.status)) {
        await this.queueDAO.remove(systemTask.taskType, taskId);
        return;
      }

      const workflowModel = this.executionDAOFacade.getWorkflowModel(
        taskModel.workflowInstanceId,
        true,
      );
      if (!workflowModel) return;

      if (taskModel.status === 'SCHEDULED') {
        await systemTask.start(workflowModel, taskModel, this.workflowExecutor);
      } else if (taskModel.status === 'IN_PROGRESS') {
        await systemTask.execute(workflowModel, taskModel, this.workflowExecutor);
      }

      if (
        !systemTask.isAsyncComplete(taskModel) &&
        !isTaskTerminal(taskModel.status) &&
        taskModel.status !== 'SCHEDULED'
      ) {
        this.workflowExecutor.updateTask({
          taskId: taskModel.taskId,
          workflowInstanceId: taskModel.workflowInstanceId,
          status: taskModel.status as any,
          outputData: taskModel.outputData,
          reasonForIncompletion: taskModel.reasonForIncompletion ?? undefined,
          workerId: taskModel.workerId ?? undefined,
          callbackAfterSeconds: taskModel.callbackAfterSeconds,
          subWorkflowId: taskModel.subWorkflowId ?? undefined,
          externalOutputPayloadStoragePath: taskModel.externalOutputPayloadStoragePath ?? undefined,
        });
      }
    } catch (e) {
      console.error(`Error executing system task: ${taskId}`, e);
    }
  }
}
