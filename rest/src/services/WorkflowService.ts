import { randomUUID } from 'node:crypto';
import type { WorkflowDef, WorkflowModel, TaskModel } from '@conductor/common';
import { TaskType, WorkflowStatus, NotFoundException, SearchResult } from '@conductor/common';
import { createWorkflowModel, DECIDER_QUEUE } from '@conductor/core';
import type { WorkflowExecutor } from '@conductor/core';
import type { ExecutionDAO, MetadataDAO, QueueDAO } from '@conductor/common-persistence';

export interface StartWorkflowRequest {
  name: string;
  version?: number;
  correlationId?: string;
  input?: Record<string, unknown>;
  taskToDomain?: Record<string, string>;
  workflowDef?: WorkflowDef;
  priority?: number;
}

export interface RerunWorkflowRequest {
  reRunFromWorkflowId?: string;
  workflowInput?: Record<string, unknown>;
  reRunFromTaskRefName?: string;
  taskInput?: Record<string, unknown>;
  correlationId?: string;
}

export class WorkflowService {
  constructor(
    private readonly executionDAO: ExecutionDAO,
    private readonly metadataDAO: MetadataDAO,
    private readonly queueDAO: QueueDAO,
    private readonly workflowExecutor?: WorkflowExecutor | null,
  ) {}

  async startWorkflow(req: StartWorkflowRequest): Promise<string> {
    if (this.workflowExecutor) {
      return this.workflowExecutor.startWorkflow({
        name: req.name,
        version: req.version ?? 1,
        workflowInput: req.input ?? {},
        correlationId: req.correlationId,
        priority: req.priority ?? 0,
        taskToDomain: req.taskToDomain ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        workflowDefinition: (req.workflowDef as any) ?? null,
      });
    }

    // Fallback: manual creation (no engine wired)
    let def: WorkflowDef;
    if (req.workflowDef) {
      def = req.workflowDef;
    } else {
      const existing = await this.metadataDAO.getWorkflowDef(req.name, req.version ?? 1);
      if (!existing) {
        throw new Error(`WorkflowDef ${req.name}.${req.version ?? 1} not found`);
      }
      def = existing;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow = createWorkflowModel() as any;
    workflow.workflowId = randomUUID();
    workflow.workflowName = def.name;
    workflow.workflowType = def.name;
    workflow.workflowVersion = def.version;
    workflow.correlationId = req.correlationId ?? null;
    workflow.input = req.input ?? {};
    workflow.priority = req.priority ?? 0;
    workflow.taskToDomain = req.taskToDomain ?? null;

    await this.executionDAO.createWorkflow(workflow);

    for (const task of workflow.tasks) {
      const taskType: string = task.taskType ?? TaskType.SIMPLE;
      if (taskType === TaskType.SIMPLE) {
        await this.queueDAO.push(taskType, task.taskId, 0, 0);
      }
    }

    return workflow.workflowId;
  }

  async executeWorkflow(req: { name: string; version: number; input: Record<string, unknown>; requestId?: string }): Promise<WorkflowModel> {
    const workflowId = await this.startWorkflow({
      name: req.name,
      version: req.version,
      input: req.input,
      correlationId: req.requestId,
    });
    // Poll for completion (up to 30s)
    for (let i = 0; i < 60; i++) {
      const wf = await this.getWorkflow(workflowId, true);
      const status = wf?.status as any;
      if (wf && (status === WorkflowStatus.COMPLETED || status === WorkflowStatus.FAILED || status === WorkflowStatus.TERMINATED)) {
        return wf;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const wf = await this.getWorkflow(workflowId, true);
    if (!wf) throw new Error(`Workflow ${workflowId} not found after execution`);
    return wf;
  }

  async getWorkflow(workflowId: string, includeTasks = true): Promise<WorkflowModel | undefined> {
    return this.executionDAO.getWorkflow(workflowId, includeTasks);
  }

  async getRunningWorkflowIds(workflowName: string, version?: number): Promise<string[]> {
    return this.executionDAO.getRunningWorkflowIds(workflowName, version ?? 1);
  }

  async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow: any = await this.executionDAO.getWorkflow(workflowId, false);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    workflow.status = WorkflowStatus.TERMINATED;
    workflow.reasonForIncompletion = reason ?? 'terminated via API';
    workflow.endTime = Date.now();
    await this.executionDAO.updateWorkflow(workflow);
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow: any = await this.executionDAO.getWorkflow(workflowId, false);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    workflow.status = WorkflowStatus.PAUSED;
    await this.executionDAO.updateWorkflow(workflow);
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow: any = await this.executionDAO.getWorkflow(workflowId, false);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    workflow.status = WorkflowStatus.RUNNING;
    await this.executionDAO.updateWorkflow(workflow);
  }

  async deleteWorkflow(workflowId: string, archiveWorkflow = true): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow: any = await this.executionDAO.getWorkflow(workflowId, false);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);

    await this.executionDAO.removeWorkflow(workflowId);
    await this.executionDAO.removeFromPendingWorkflow(workflow.workflowType ?? workflow.workflowName, workflowId);
    await this.queueDAO.remove(DECIDER_QUEUE, workflowId);
  }

  async getPendingTasksForTaskType(taskType: string): Promise<TaskModel[]> {
    return this.executionDAO.getPendingTasksForTaskType(taskType);
  }

  async requeueSweep(workflowId: string): Promise<string> {
    const pushed = await this.queueDAO.pushIfNotExists(DECIDER_QUEUE, workflowId, 0, 0);
    return `${pushed}.${workflowId}`;
  }

  async decideWorkflow(workflowId: string): Promise<void> {
    await this.requeueSweep(workflowId);
  }

  async rerunWorkflow(workflowId: string, _request: RerunWorkflowRequest): Promise<string> {
    if (this.workflowExecutor) {
      return this.workflowExecutor.rerun({
        reRunFromWorkflowId: workflowId,
        workflowInput: _request.workflowInput,
        correlationId: _request.correlationId,
      });
    }
    const workflow = await this.executionDAO.getWorkflow(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    const newWfId = randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rerunInput = _request.workflowInput ?? workflow.input;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newWorkflow: any = Object.assign({}, workflow);
    newWorkflow.workflowId = newWfId;
    newWorkflow.input = rerunInput;
    newWorkflow.status = WorkflowStatus.RUNNING;
    newWorkflow.startTime = Date.now();
    newWorkflow.endTime = undefined;
    newWorkflow.reasonForIncompletion = undefined;
    await this.executionDAO.createWorkflow(newWorkflow);
    await this.queueDAO.pushIfNotExists(DECIDER_QUEUE, newWfId, 0, 0);
    return newWfId;
  }

  async restartWorkflow(workflowId: string, useLatestDefinitions = false): Promise<void> {
    if (this.workflowExecutor) {
      this.workflowExecutor.restart(workflowId, useLatestDefinitions);
      return;
    }
    const workflow = await this.executionDAO.getWorkflow(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf: any = workflow;
    wf.status = WorkflowStatus.RUNNING;
    wf.endTime = undefined;
    wf.reasonForIncompletion = undefined;
    wf.startTime = Date.now();
    await this.executionDAO.updateWorkflow(wf);
    await this.queueDAO.pushIfNotExists(DECIDER_QUEUE, workflowId, 0, 0);
  }

  async retryWorkflow(workflowId: string, resumeSubworkflowTasks = false): Promise<void> {
    if (this.workflowExecutor) {
      this.workflowExecutor.retry(workflowId, resumeSubworkflowTasks);
      return;
    }
    const workflow = await this.executionDAO.getWorkflow(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf: any = workflow;
    wf.status = WorkflowStatus.RUNNING;
    wf.endTime = undefined;
    wf.reasonForIncompletion = undefined;
    await this.executionDAO.updateWorkflow(wf);
    await this.queueDAO.pushIfNotExists(DECIDER_QUEUE, workflowId, 0, 0);
  }

  async resetWorkflow(workflowId: string): Promise<void> {
    if (this.workflowExecutor) {
      this.workflowExecutor.resetCallbacksForWorkflow(workflowId);
      return;
    }
    const workflow = await this.executionDAO.getWorkflow(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    await this.queueDAO.pushIfNotExists(DECIDER_QUEUE, workflowId, 0, 0);
  }

  async terminateRemove(workflowId: string, reason?: string, archiveWorkflow = true): Promise<void> {
    await this.terminateWorkflow(workflowId, reason);
    await this.deleteWorkflow(workflowId, archiveWorkflow);
  }

  async getWorkflowTasks(
    workflowId: string,
    start = 0,
    count = 15,
    status?: string[],
  ): Promise<SearchResult<TaskModel>> {
    const workflow = await this.executionDAO.getWorkflow(workflowId, true);
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);

    let tasks = workflow.tasks ?? [];
    if (status && status.length > 0) {
      const upper = status.map(s => s.toUpperCase());
      tasks = tasks.filter(t => t.status && upper.includes(t.status));
    }

    const totalHits = tasks.length;
    const results = tasks.slice(start, start + count);
    return new SearchResult(totalHits, results);
  }

  async searchWorkflows(
    _start = 0,
    _size = 100,
    _sort?: string,
    _freeText = '*',
    _query?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<SearchResult<any>> {
    return new SearchResult(0, []);
  }
}
