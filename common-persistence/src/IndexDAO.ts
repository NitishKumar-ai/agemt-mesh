import {
  TaskModel,
  WorkflowModel,
  SearchResult,
  TaskExecLog,
  Message,
  EventExecution,
} from '@agentmesh/common';

export interface IndexDAO {
  setup(): Promise<void>;

  indexWorkflow(workflow: WorkflowModel): Promise<void>;
  asyncIndexWorkflow(workflow: WorkflowModel): Promise<void>;

  indexTask(task: TaskModel): Promise<void>;
  asyncIndexTask(task: TaskModel): Promise<void>;

  addTaskExecutionLogs(logs: TaskExecLog[]): Promise<void>;
  asyncAddTaskExecutionLogs(logs: TaskExecLog[]): Promise<void>;
  getTaskExecutionLogs(taskId: string): Promise<TaskExecLog[]>;

  addMessage(queue: string, message: Message): Promise<void>;
  asyncAddMessage(queue: string, message: Message): Promise<void>;
  getMessages(queue: string): Promise<Message[]>;

  addEventExecution(eventExecution: EventExecution): Promise<void>;
  asyncAddEventExecution(eventExecution: EventExecution): Promise<void>;
  getEventExecutions(event: string): Promise<EventExecution[]>;

  searchWorkflows(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[],
  ): Promise<SearchResult<string>>;
  searchWorkflowSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[],
  ): Promise<SearchResult<WorkflowModel>>;

  searchTasks(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[],
  ): Promise<SearchResult<string>>;
  searchTaskSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[],
  ): Promise<SearchResult<TaskModel>>;

  removeWorkflow(workflowId: string): Promise<void>;
  asyncRemoveWorkflow(workflowId: string): Promise<void>;

  updateWorkflow(workflowInstanceId: string, keys: string[], values: any[]): Promise<void>;
  asyncUpdateWorkflow(workflowInstanceId: string, keys: string[], values: any[]): Promise<void>;

  removeTask(workflowId: string, taskId: string): Promise<void>;
  asyncRemoveTask(workflowId: string, taskId: string): Promise<void>;

  updateTask(workflowId: string, taskId: string, keys: string[], values: any[]): Promise<void>;
  asyncUpdateTask(workflowId: string, taskId: string, keys: string[], values: any[]): Promise<void>;

  get(workflowInstanceId: string, fieldToGet: string): Promise<string>;

  searchArchivableWorkflows(indexName: string, archiveTtlDays: number): Promise<string[]>;

  getWorkflowCount(query: string, freeText: string): Promise<number>;
}
