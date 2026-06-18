import { isTaskTerminal, isWorkflowTerminal } from '@agentmesh/common';
import type { TaskModel, WorkflowModel } from './types.js';
import type {
  QueueDAO,
  ExecutionDAOFacade,
  ExecutionLockService,
  AgentMeshProperties,
} from './WorkflowExecutorOps.js';
import type { WorkflowExecutor } from './WorkflowExecutor.js';
import type { SystemTaskRegistry } from './SystemTaskRegistry.js';
import { DECIDER_QUEUE, getQueueName } from './ExecutorUtils.js';

export interface SweeperProperties {
  sweepBatchSize: number;
  queuePopTimeout: number;
}

export class WorkflowSweeper {
  private readonly queueDAO: QueueDAO;
  private readonly sweeperProperties: SweeperProperties;
  private readonly workflowExecutor: WorkflowExecutor;
  private readonly executionDAO: ExecutionDAOFacade;
  private readonly systemTaskRegistry: SystemTaskRegistry;
  private readonly executionLockService: ExecutionLockService;
  private readonly properties: AgentMeshProperties;

  constructor(params: {
    queueDAO: QueueDAO;
    workflowExecutor: WorkflowExecutor;
    executionDAO: ExecutionDAOFacade;
    properties: AgentMeshProperties;
    sweeperProperties: SweeperProperties;
    systemTaskRegistry: SystemTaskRegistry;
    executionLockService: ExecutionLockService;
  }) {
    this.queueDAO = params.queueDAO;
    this.workflowExecutor = params.workflowExecutor;
    this.executionDAO = params.executionDAO;
    this.properties = params.properties;
    this.sweeperProperties = params.sweeperProperties;
    this.systemTaskRegistry = params.systemTaskRegistry;
    this.executionLockService = params.executionLockService;
  }

  private isTaskRepairable(task: TaskModel): boolean {
    if (this.systemTaskRegistry.isSystemTask(task.taskType)) {
      const systemTask = this.systemTaskRegistry.get(task.taskType);
      return (
        systemTask.isAsync() &&
        (!systemTask.isAsyncComplete(task) ||
          (systemTask.isAsyncComplete(task) && task.status === 'SCHEDULED')) &&
        (task.status === 'IN_PROGRESS' || task.status === 'SCHEDULED')
      );
    } else {
      return (
        task.status === 'SCHEDULED' ||
        (!isTaskTerminal(task.status) &&
          task.waitTimeout > 0 &&
          Date.now() - task.waitTimeout > 1000)
      );
    }
  }

  async sweep(workflowId: string): Promise<void> {
    const lockAcquired = this.executionLockService.acquireLock(workflowId);
    if (!lockAcquired) {
      return;
    }

    try {
      let workflow = this.workflowExecutor.getWorkflow(workflowId, true);
      if (!workflow || isWorkflowTerminal(workflow.status)) {
        this.queueDAO.remove(DECIDER_QUEUE, workflowId);
        return;
      }

      const tasksBeforeDecide = workflow.tasks
        .map((t) => `${t.referenceTaskName}:${t.status}`)
        .join(',');

      workflow = this.workflowExecutor.decide(workflowId);
      if (!workflow) {
        const leaseMs = this.properties.lockLeaseTime;
        let backoffSeconds = Math.max(1, Math.floor(leaseMs / 2000));
        const maxPostpone = this.properties.maxPostponeDurationSeconds;
        if (maxPostpone > 0 && backoffSeconds > maxPostpone) {
          backoffSeconds = maxPostpone;
        }
        this.queueDAO.push(DECIDER_QUEUE, workflowId, 0, backoffSeconds);
        return;
      }

      if (isWorkflowTerminal(workflow.status)) {
        this.queueDAO.remove(DECIDER_QUEUE, workflow.workflowId);
        return;
      }

      const tasksAfterDecide = workflow.tasks
        .map((t) => `${t.referenceTaskName}:${t.status}`)
        .join(',');

      if (tasksBeforeDecide === tasksAfterDecide) {
        let repairedSubWorkflowTask = false;
        for (const task of workflow.tasks) {
          if (this.isTaskRepairable(task)) {
            const queueName = getQueueName(task);
            if (!this.queueDAO.containsMessage(queueName, task.taskId)) {
              if (!this.queueDAO.containsMessage(queueName, task.taskId)) {
                this.queueDAO.push(queueName, task.taskId, 0, task.callbackAfterSeconds);
              }
            }
          } else if (task.taskType === 'SUB_WORKFLOW' && task.status === 'IN_PROGRESS') {
            const subWorkflow = this.executionDAO.getWorkflowModel(task.subWorkflowId ?? '', false);
            if (subWorkflow && isWorkflowTerminal(subWorkflow.status)) {
              this.repairSubWorkflowTask(task, subWorkflow);
              repairedSubWorkflowTask = true;
            }
          }
        }

        if (repairedSubWorkflowTask) {
          const finalWf = this.workflowExecutor.decide(workflowId);
          if (finalWf && isWorkflowTerminal(finalWf.status)) {
            this.queueDAO.remove(DECIDER_QUEUE, finalWf.workflowId);
            return;
          }
        }
      }

      const hasRunningTasks = workflow.tasks.some((task) => !isTaskTerminal(task.status));
      if (!hasRunningTasks) {
        this.forceSetLastTaskAsNotExecuted(workflow);
        this.workflowExecutor.decide(workflowId);
      }

      if (workflow.parentWorkflowId) {
        this.ensureWorkflowExistsInDecider(workflow.parentWorkflowId);
      }
    } finally {
      this.executionLockService.releaseLock(workflowId);
    }
  }

  private repairSubWorkflowTask(task: TaskModel, subWorkflow: WorkflowModel): void {
    switch (subWorkflow.status) {
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
      default:
        return;
    }
    task.outputData = { ...task.outputData, ...subWorkflow.output };
    this.executionDAO.updateTask(task);
  }

  private forceSetLastTaskAsNotExecuted(workflow: WorkflowModel): void {
    if (workflow.tasks && workflow.tasks.length > 0) {
      const lastTask = workflow.tasks[workflow.tasks.length - 1];
      if (lastTask) {
        lastTask.executed = false;
        this.executionDAO.updateTask(lastTask);
        this.executionDAO.updateWorkflow(workflow);
      }
    }
  }

  private ensureWorkflowExistsInDecider(workflowId: string): void {
    if (!this.queueDAO.containsMessage(DECIDER_QUEUE, workflowId)) {
      this.queueDAO.push(DECIDER_QUEUE, workflowId, 0, this.properties.workflowOffsetTimeout);
    }
  }
}
