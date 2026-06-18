import { MetadataDAO, WorkflowDefSummary } from '@agentmesh/common-persistence';
import { TaskDef, WorkflowDef, EventHandler } from '@agentmesh/common';
import { Redis } from 'ioredis';

export class RedisMetadataDAO implements MetadataDAO {
  constructor(private readonly redis: Redis) {}

  async createTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    await this.redis.hset('TASK_DEFS', taskDef.name, JSON.stringify(taskDef));
    return taskDef;
  }
  async updateTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    await this.redis.hset('TASK_DEFS', taskDef.name, JSON.stringify(taskDef));
    return taskDef;
  }
  async getTaskDef(name: string): Promise<TaskDef | undefined> {
    const val = await this.redis.hget('TASK_DEFS', name);
    return val ? JSON.parse(val) : undefined;
  }
  async getAllTaskDefs(): Promise<TaskDef[]> {
    const vals = await this.redis.hvals('TASK_DEFS');
    return vals.map((v: string) => JSON.parse(v));
  }
  async removeTaskDef(name: string): Promise<void> {
    await this.redis.hdel('TASK_DEFS', name);
  }

  async createWorkflowDef(def: WorkflowDef): Promise<void> {
    await this.redis.hset('WORKFLOW_DEFS', `${def.name}:${def.version}`, JSON.stringify(def));
  }
  async updateWorkflowDef(def: WorkflowDef): Promise<void> {
    await this.redis.hset('WORKFLOW_DEFS', `${def.name}:${def.version}`, JSON.stringify(def));
  }
  async getLatestWorkflowDef(name: string): Promise<WorkflowDef | undefined> {
    const vals = await this.redis.hvals('WORKFLOW_DEFS');
    const defs: WorkflowDef[] = vals.map((v: string) => JSON.parse(v));
    const matchingDefs = defs.filter(d => d.name === name);
    if (matchingDefs.length === 0) return undefined;
    matchingDefs.sort((a, b) => (b.version || 0) - (a.version || 0));
    return matchingDefs[0];
  }
  async getWorkflowDef(name: string, version: number): Promise<WorkflowDef | undefined> {
    const val = await this.redis.hget('WORKFLOW_DEFS', `${name}:${version}`);
    return val ? JSON.parse(val) : undefined;
  }
  async removeWorkflowDef(name: string, version: number): Promise<void> {
    await this.redis.hdel('WORKFLOW_DEFS', `${name}:${version}`);
  }
  async getAllWorkflowDefs(): Promise<WorkflowDef[]> {
    const vals = await this.redis.hvals('WORKFLOW_DEFS');
    return vals.map((v: string) => JSON.parse(v));
  }
  async getAllWorkflowDefsLatestVersions(): Promise<WorkflowDef[]> {
    const defs = await this.getAllWorkflowDefs();
    const map = new Map<string, WorkflowDef>();
    for (const def of defs) {
      const existing = map.get(def.name);
      if (!existing || (def.version || 0) > (existing.version || 0)) {
        map.set(def.name, def);
      }
    }
    return Array.from(map.values());
  }
  async getWorkflowNames(): Promise<string[]> {
    const defs = await this.getAllWorkflowDefs();
    return Array.from(new Set(defs.map(d => d.name)));
  }
  async getWorkflowVersions(name: string): Promise<WorkflowDefSummary[]> {
    const defs = await this.getAllWorkflowDefs();
    return defs.filter(d => d.name === name).map(d => ({
      name: d.name,
      version: d.version,
      createTime: d.createTime
    }));
  }

  async addEventHandler(handler: EventHandler): Promise<void> {
    await this.redis.hset('EVENT_HANDLERS', handler.name, JSON.stringify(handler));
  }
  async updateEventHandler(handler: EventHandler): Promise<void> {
    await this.redis.hset('EVENT_HANDLERS', handler.name, JSON.stringify(handler));
  }
  async removeEventHandlerStatus(name: string): Promise<void> {
    await this.redis.hdel('EVENT_HANDLERS', name);
  }
  async getAllEventHandlers(): Promise<EventHandler[]> {
    const vals = await this.redis.hvals('EVENT_HANDLERS');
    return vals.map((v: string) => JSON.parse(v));
  }
  async getEventHandlersForEvent(event: string, activeOnly: boolean): Promise<EventHandler[]> {
    const handlers = await this.getAllEventHandlers();
    return handlers.filter(h => h.event === event && (!activeOnly || h.active));
  }
}
