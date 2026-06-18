import type { TaskDef, WorkflowDef } from '@conductor/common';
import { BulkResponse } from '@conductor/common';
import type { MetadataDAO, WorkflowDefSummary } from '@conductor/common-persistence';

export class MetadataService {
  constructor(private readonly metadataDAO: MetadataDAO) {}

  async registerWorkflowDef(def: WorkflowDef): Promise<void> {
    const existing = await this.metadataDAO.getWorkflowDef(def.name, def.version);
    if (existing) {
      throw new Error(`WorkflowDef ${def.name}.${def.version} already exists`);
    }
    await this.metadataDAO.createWorkflowDef(def);
  }

  async updateWorkflowDefs(defs: WorkflowDef[]): Promise<BulkResponse<string>> {
    const result = new BulkResponse<string>();
    for (const def of defs) {
      try {
        await this.metadataDAO.updateWorkflowDef(def);
        result.appendSuccessResponse(def.name);
      } catch (err) {
        result.appendFailedResponse(def.name, (err as Error).message);
      }
    }
    return result;
  }

  async validateWorkflowDef(_def: WorkflowDef): Promise<void> {
    return;
  }

  async getWorkflowDef(name: string, version?: number): Promise<WorkflowDef | undefined> {
    if (version !== undefined) {
      return this.metadataDAO.getWorkflowDef(name, version);
    }
    return this.metadataDAO.getLatestWorkflowDef(name);
  }

  async getWorkflowDefs(): Promise<WorkflowDef[]> {
    return this.metadataDAO.getAllWorkflowDefs();
  }

  async getWorkflowNames(): Promise<string[]> {
    return this.metadataDAO.getWorkflowNames();
  }

  async getWorkflowVersions(name: string): Promise<WorkflowDefSummary[]> {
    return this.metadataDAO.getWorkflowVersions(name);
  }

  async getWorkflowNamesAndVersions(): Promise<Record<string, WorkflowDefSummary[]>> {
    const names = await this.metadataDAO.getWorkflowNames();
    const result: Record<string, WorkflowDefSummary[]> = {};
    for (const name of names) {
      result[name] = await this.metadataDAO.getWorkflowVersions(name);
    }
    return result;
  }

  async getLatestVersions(): Promise<WorkflowDef[]> {
    return this.metadataDAO.getAllWorkflowDefsLatestVersions();
  }

  async removeWorkflowDef(name: string, version: number): Promise<void> {
    await this.metadataDAO.removeWorkflowDef(name, version);
  }

  async registerTaskDefs(defs: TaskDef[]): Promise<void> {
    for (const def of defs) {
      const existing = await this.metadataDAO.getTaskDef(def.name);
      if (existing) {
        throw new Error(`TaskDef ${def.name} already exists`);
      }
      await this.metadataDAO.createTaskDef(def);
    }
  }

  async updateTaskDef(def: TaskDef): Promise<void> {
    await this.metadataDAO.updateTaskDef(def);
  }

  async getTaskDefs(): Promise<TaskDef[]> {
    return this.metadataDAO.getAllTaskDefs();
  }

  async getTaskDef(taskType: string): Promise<TaskDef | undefined> {
    return this.metadataDAO.getTaskDef(taskType);
  }

  async removeTaskDef(taskType: string): Promise<void> {
    await this.metadataDAO.removeTaskDef(taskType);
  }
}