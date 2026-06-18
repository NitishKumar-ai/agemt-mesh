import { MetadataDAO, WorkflowDefSummary } from '@agentmesh/common-persistence';
import { TaskDef, WorkflowDef, EventHandler } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

export class CassandraMetadataDAO extends CassandraBaseDAO implements MetadataDAO {
  constructor(client: Client) {
    super(client);
  }

  async createTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    const query = 'INSERT INTO task_definitions (name, payload) VALUES (?, ?)';
    await this.client.execute(query, [taskDef.name, JSON.stringify(taskDef)], { prepare: true });
    return taskDef;
  }

  async updateTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    return this.createTaskDef(taskDef);
  }

  async getTaskDef(name: string): Promise<TaskDef | undefined> {
    const query = 'SELECT payload FROM task_definitions WHERE name = ?';
    const result = await this.client.execute(query, [name], { prepare: true });
    if (result.rowLength === 0) return undefined;
    return JSON.parse(result.first().get('payload'));
  }

  async getAllTaskDefs(): Promise<TaskDef[]> {
    const query = 'SELECT payload FROM task_definitions';
    const result = await this.client.execute(query, [], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  async removeTaskDef(name: string): Promise<void> {
    const query = 'DELETE FROM task_definitions WHERE name = ?';
    await this.client.execute(query, [name], { prepare: true });
  }

  async createWorkflowDef(def: WorkflowDef): Promise<void> {
    const query = 'INSERT INTO workflow_definitions (name, version, payload) VALUES (?, ?, ?)';
    await this.client.execute(query, [def.name, def.version, JSON.stringify(def)], {
      prepare: true,
    });
    const latestQuery = 'INSERT INTO workflow_defs_latest (name, version) VALUES (?, ?)';
    await this.client.execute(latestQuery, [def.name, def.version], { prepare: true });
  }

  async updateWorkflowDef(def: WorkflowDef): Promise<void> {
    await this.createWorkflowDef(def);
  }

  async getLatestWorkflowDef(name: string): Promise<WorkflowDef | undefined> {
    const latestVersionQuery = 'SELECT version FROM workflow_defs_latest WHERE name = ?';
    const result = await this.client.execute(latestVersionQuery, [name], { prepare: true });
    if (result.rowLength === 0) return undefined;
    const version = result.first().get('version');
    return this.getWorkflowDef(name, version);
  }

  async getWorkflowDef(name: string, version: number): Promise<WorkflowDef | undefined> {
    const query = 'SELECT payload FROM workflow_definitions WHERE name = ? AND version = ?';
    const result = await this.client.execute(query, [name, version], { prepare: true });
    if (result.rowLength === 0) return undefined;
    return JSON.parse(result.first().get('payload'));
  }

  async removeWorkflowDef(name: string, version: number): Promise<void> {
    const query = 'DELETE FROM workflow_definitions WHERE name = ? AND version = ?';
    await this.client.execute(query, [name, version], { prepare: true });
  }

  async getAllWorkflowDefs(): Promise<WorkflowDef[]> {
    const query = 'SELECT payload FROM workflow_definitions';
    const result = await this.client.execute(query, [], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  async getAllWorkflowDefsLatestVersions(): Promise<WorkflowDef[]> {
    const query = 'SELECT name, version FROM workflow_defs_latest';
    const result = await this.client.execute(query, [], { prepare: true });
    const defs: WorkflowDef[] = [];
    for (const row of result.rows) {
      const def = await this.getWorkflowDef(row.get('name'), row.get('version'));
      if (def) defs.push(def);
    }
    return defs;
  }

  async getWorkflowNames(): Promise<string[]> {
    const query = 'SELECT name FROM workflow_defs_latest';
    const result = await this.client.execute(query, [], { prepare: true });
    return result.rows.map((row) => row.get('name'));
  }

  async getWorkflowVersions(name: string): Promise<WorkflowDefSummary[]> {
    const query = 'SELECT version, payload FROM workflow_definitions WHERE name = ?';
    const result = await this.client.execute(query, [name], { prepare: true });
    return result.rows.map((row) => {
      const def = JSON.parse(row.get('payload')) as WorkflowDef;
      return {
        name: def.name,
        version: def.version,
        createTime: def.createTime,
      };
    });
  }

  async addEventHandler(handler: EventHandler): Promise<void> {
    const query = 'INSERT INTO event_handlers (name, event, active, payload) VALUES (?, ?, ?, ?)';
    await this.client.execute(
      query,
      [handler.name, handler.event, handler.active, JSON.stringify(handler)],
      { prepare: true },
    );
  }

  async updateEventHandler(handler: EventHandler): Promise<void> {
    await this.addEventHandler(handler);
  }

  async removeEventHandlerStatus(name: string): Promise<void> {
    const query = 'DELETE FROM event_handlers WHERE name = ?';
    await this.client.execute(query, [name], { prepare: true });
  }

  async getAllEventHandlers(): Promise<EventHandler[]> {
    const query = 'SELECT payload FROM event_handlers';
    const result = await this.client.execute(query, [], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  async getEventHandlersForEvent(event: string, activeOnly: boolean): Promise<EventHandler[]> {
    const handlers = await this.getAllEventHandlers();
    return handlers.filter((h) => h.event === event && (!activeOnly || h.active));
  }
}
