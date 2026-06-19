import type { ExecutionDAO, MetadataDAO, QueueDAO } from '@agentmesh/common-persistence';
import type { WorkflowModel, TaskModel, WorkflowDef, TaskDef, EventHandler } from '@agentmesh/common';

/**
 * In-memory scheduler storage (v1 — replace with a real DAO once available).
 */
export interface StoredSchedule {
  name: string;
  workflowName: string;
  workflowVersion: number;
  cronExpression: string;
  startTime?: number;
  endTime?: number;
  enabled: boolean;
  createdBy?: string;
  createTime: number;
  updatedTime: number;
}

export class OrchestrationService {
  private readonly schedules = new Map<string, StoredSchedule>();

  constructor(
    private readonly executionDAO: ExecutionDAO,
    private readonly metadataDAO: MetadataDAO,
    private readonly queueDAO: QueueDAO,
  ) {}

  // ── Workflow Definitions ──────────────────────────────────────────

  async listWorkflowDefs(): Promise<WorkflowDef[]> {
    return this.metadataDAO.getAllWorkflowDefs();
  }

  async getWorkflowDef(name: string, version?: number): Promise<WorkflowDef | undefined> {
    if (version) return this.metadataDAO.getWorkflowDef(name, version);
    return this.metadataDAO.getLatestWorkflowDef(name);
  }

  async saveWorkflowDef(def: WorkflowDef): Promise<void> {
    const existing = await this.metadataDAO.getLatestWorkflowDef(def.name);
    if (existing) {
      await this.metadataDAO.updateWorkflowDef(def);
    } else {
      await this.metadataDAO.createWorkflowDef(def);
    }
  }

  async deleteWorkflowDef(name: string, version?: number): Promise<void> {
    if (version) {
      await this.metadataDAO.removeWorkflowDef(name, version);
    } else {
      const versions = await this.metadataDAO.getWorkflowVersions(name);
      for (const v of versions) {
        if (v.version !== undefined) {
          await this.metadataDAO.removeWorkflowDef(name, v.version);
        }
      }
    }
  }

  // ── Task Definitions ──────────────────────────────────────────────

  async listTaskDefs(): Promise<TaskDef[]> {
    return this.metadataDAO.getAllTaskDefs();
  }

  async getTaskDef(name: string): Promise<TaskDef | undefined> {
    return this.metadataDAO.getTaskDef(name);
  }

  async saveTaskDef(def: TaskDef): Promise<void> {
    const existing = await this.metadataDAO.getTaskDef(def.name);
    if (existing) {
      await this.metadataDAO.updateTaskDef(def);
    } else {
      await this.metadataDAO.createTaskDef(def);
    }
  }

  async deleteTaskDef(name: string): Promise<void> {
    await this.metadataDAO.removeTaskDef(name);
  }

  // ── Workflow Executions ───────────────────────────────────────────

  async searchExecutions(params?: Record<string, string>): Promise<{
    totalHits: number;
    results: WorkflowModel[];
  }> {
    const wfName = params?.workflowName;
    const status = params?.status;
    const limit = parseInt(params?.limit ?? '20', 10);

    let results: WorkflowModel[] = [];
    const names = wfName
      ? [wfName]
      : (await this.metadataDAO.getWorkflowNames()).slice(0, 5);

    for (const name of names) {
      const versions = await this.metadataDAO.getWorkflowVersions(name);
      for (const v of versions.slice(0, 3)) {
        const ids = await this.executionDAO.getRunningWorkflowIds(name, v.version ?? 1);
        for (const id of ids) {
          const wf = await this.executionDAO.getWorkflow(id, false);
          if (wf && (!status || wf.status === status)) {
            results.push(wf);
          }
          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    results.reverse();
    return { totalHits: results.length, results };
  }

  async getExecution(id: string): Promise<WorkflowModel | undefined> {
    return this.executionDAO.getWorkflow(id, true);
  }

  async getExecutionTasks(id: string): Promise<TaskModel[]> {
    const wf = await this.executionDAO.getWorkflow(id, true);
    return wf?.tasks ?? [];
  }

  // ── Event Handlers ────────────────────────────────────────────────

  async listEventHandlers(): Promise<EventHandler[]> {
    return this.metadataDAO.getAllEventHandlers();
  }

  async getEventHandler(name: string): Promise<EventHandler | undefined> {
    const handlers = await this.metadataDAO.getAllEventHandlers();
    return handlers.find((h) => h.name === name);
  }

  async saveEventHandler(handler: EventHandler): Promise<void> {
    await this.metadataDAO.addEventHandler(handler);
  }

  async deleteEventHandler(name: string): Promise<void> {
    await this.metadataDAO.removeEventHandlerStatus(name);
  }

  // ── Schedulers (in-memory v1) ─────────────────────────────────────

  async listSchedules(): Promise<StoredSchedule[]> {
    return [...this.schedules.values()];
  }

  async getSchedule(name: string): Promise<StoredSchedule | undefined> {
    return this.schedules.get(name);
  }

  async saveSchedule(schedule: {
    name: string;
    workflowName: string;
    workflowVersion?: number;
    cronExpression: string;
    startTime?: number;
    endTime?: number;
    enabled?: boolean;
    createdBy?: string;
  }): Promise<void> {
    const now = Date.now();
    const existing = this.schedules.get(schedule.name);
    this.schedules.set(schedule.name, {
      name: schedule.name,
      workflowName: schedule.workflowName,
      workflowVersion: schedule.workflowVersion ?? 1,
      cronExpression: schedule.cronExpression,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      enabled: schedule.enabled ?? true,
      createdBy: schedule.createdBy,
      createTime: existing?.createTime ?? now,
      updatedTime: now,
    });
  }

  async deleteSchedule(name: string): Promise<boolean> {
    return this.schedules.delete(name);
  }

  // ── Task Queue Search ─────────────────────────────────────────────

  async searchTasks(params?: Record<string, string>): Promise<{
    totalHits: number;
    results: TaskModel[];
  }> {
    const taskType = params?.taskType;
    const status = params?.status;
    const limit = parseInt(params?.limit ?? '20', 10);

    // Collect task models from running workflows
    const names = (await this.metadataDAO.getWorkflowNames()).slice(0, 3);
    const results: TaskModel[] = [];

    for (const name of names) {
      const versions = await this.metadataDAO.getWorkflowVersions(name);
      for (const v of versions.slice(0, 2)) {
        const ids = await this.executionDAO.getRunningWorkflowIds(name, v.version ?? 1);
        for (const wfId of ids) {
          const wf = await this.executionDAO.getWorkflow(wfId, true);
          if (!wf?.tasks) continue;
          for (const task of wf.tasks) {
            if (taskType && task.taskType !== taskType) continue;
            if (status && task.status !== status) continue;
            results.push(task);
            if (results.length >= limit) break;
          }
          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return { totalHits: results.length, results };
  }

  // ── Schemas (stub — returns empty) ────────────────────────────────

  async listSchemas(): Promise<Array<{ name: string; version: number }>> {
    return [];
  }

  async getSchema(_name: string, _version?: number): Promise<Record<string, unknown> | null> {
    return null;
  }

  // ── Monitoring ────────────────────────────────────────────────────

  async getTaskQueues(): Promise<Record<string, { size: number; uacked: number }>> {
    const queues = await this.queueDAO.queuesDetailVerbose();
    const result: Record<string, { size: number; uacked: number }> = {};
    for (const [name, shards] of Object.entries(queues)) {
      let size = 0;
      let uacked = 0;
      for (const shard of Object.values(shards)) {
        size += shard.size ?? 0;
        uacked += shard.uacked ?? 0;
      }
      result[name] = { size, uacked };
    }
    return result;
  }

  async getEventQueues(): Promise<Array<{ queueName: string; size: number }>> {
    const queues = await this.queueDAO.queuesDetail();
    return Object.entries(queues).map(([queueName, size]) => ({ queueName, size }));
  }
}
