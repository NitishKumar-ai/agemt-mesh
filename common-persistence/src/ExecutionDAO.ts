import { TaskModel, WorkflowModel, EventExecution, TaskExecLog } from '@agentmesh/common';

export interface ExecutionDAO {
  getPendingTasksByWorkflow(taskName: string, workflowId: string): Promise<TaskModel[]>;
  getTasks(taskType: string, startKey: string, count: number): Promise<TaskModel[]>;
  createTasks(tasks: TaskModel[]): Promise<TaskModel[]>;
  updateTask(task: TaskModel): Promise<void>;

  removeTask(taskId: string): Promise<boolean>;
  getTask(taskId: string): Promise<TaskModel | undefined>;
  getTasksByIds(taskIds: string[]): Promise<TaskModel[]>;
  getPendingTasksForTaskType(taskType: string): Promise<TaskModel[]>;
  getTasksForWorkflow(workflowId: string): Promise<TaskModel[]>;

  createWorkflow(workflow: WorkflowModel): Promise<string>;
  updateWorkflow(workflow: WorkflowModel): Promise<string>;
  removeWorkflow(workflowId: string): Promise<boolean>;
  removeWorkflowWithExpiry(workflowId: string, ttlSeconds: number): Promise<boolean>;
  removeFromPendingWorkflow(workflowType: string, workflowId: string): Promise<void>;

  getWorkflow(workflowId: string, includeTasks?: boolean): Promise<WorkflowModel | undefined>;
  getRunningWorkflowIds(workflowName: string, version: number): Promise<string[]>;
  getPendingWorkflowsByType(workflowName: string, version: number): Promise<WorkflowModel[]>;
  getPendingWorkflowCount(workflowName: string): Promise<number>;
  getInProgressTaskCount(taskDefName: string): Promise<number>;
  getWorkflowsByType(
    workflowName: string,
    startTime: number,
    endTime: number,
  ): Promise<WorkflowModel[]>;
  getWorkflowsByCorrelationId(
    workflowName: string,
    correlationId: string,
    includeTasks: boolean,
  ): Promise<WorkflowModel[]>;

  canSearchAcrossWorkflows(): boolean;

  addEventExecution(eventExecution: EventExecution): Promise<boolean>;
  updateEventExecution(eventExecution: EventExecution): Promise<void>;
  removeEventExecution(eventExecution: EventExecution): Promise<void>;

  addTaskLog(taskId: string, log: TaskExecLog): Promise<void>;
  getTaskLogs(taskId: string): Promise<TaskExecLog[]>;
}
