import { TaskDef, WorkflowDef, EventHandler } from '@agentmesh/common';

export interface WorkflowDefSummary {
  name?: string;
  version?: number;
  createTime?: number;
}

export interface MetadataDAO {
  createTaskDef(taskDef: TaskDef): Promise<TaskDef>;
  updateTaskDef(taskDef: TaskDef): Promise<TaskDef>;
  getTaskDef(name: string): Promise<TaskDef | undefined>;
  getAllTaskDefs(): Promise<TaskDef[]>;
  removeTaskDef(name: string): Promise<void>;

  createWorkflowDef(def: WorkflowDef): Promise<void>;
  updateWorkflowDef(def: WorkflowDef): Promise<void>;
  getLatestWorkflowDef(name: string): Promise<WorkflowDef | undefined>;
  getWorkflowDef(name: string, version: number): Promise<WorkflowDef | undefined>;
  removeWorkflowDef(name: string, version: number): Promise<void>;
  getAllWorkflowDefs(): Promise<WorkflowDef[]>;
  getAllWorkflowDefsLatestVersions(): Promise<WorkflowDef[]>;

  getWorkflowNames(): Promise<string[]>;
  getWorkflowVersions(name: string): Promise<WorkflowDefSummary[]>;

  addEventHandler(handler: EventHandler): Promise<void>;
  updateEventHandler(handler: EventHandler): Promise<void>;
  removeEventHandlerStatus(name: string): Promise<void>;
  getAllEventHandlers(): Promise<EventHandler[]>;
  getEventHandlersForEvent(event: string, activeOnly: boolean): Promise<EventHandler[]>;
}
