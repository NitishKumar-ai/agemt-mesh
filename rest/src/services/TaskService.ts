import type { TaskModel, WorkflowModel, TaskStatus as TaskStatusType, TaskExecLog, PollData } from '@conductor/common';
import { SearchResult } from '@conductor/common';
import { TaskStatus, isTaskTerminal } from '@conductor/common';
import type { ExecutionDAO, QueueDAO, MetadataDAO, PollDataDAO } from '@conductor/common-persistence';

export interface TaskResult {
  workflowInstanceId: string;
  taskId?: string;
  reasonForIncompletion?: string;
  callbackAfterSeconds?: number;
  outputData?: Record<string, unknown>;
  workerId?: string;
  status: TaskStatusType;
  logs?: Array<{ log: string; createdTime?: number }>;
}

export class TaskService {
  constructor(
    private readonly executionDAO: ExecutionDAO,
    private readonly queueDAO: QueueDAO,
    private readonly metadataDAO: MetadataDAO,
    private readonly pollDataDAO: PollDataDAO,
  ) {}

  async poll(taskType: string, workerId?: string, domain?: string): Promise<TaskModel | undefined> {
    const taskIds = await this.queueDAO.pop(taskType, 1, 200);
    if (!taskIds || taskIds.length === 0) return undefined;
    return this.executionDAO.getTask(taskIds[0]!);
  }

  async pollBatch(taskType: string, count = 1, timeout = 100): Promise<TaskModel[]> {
    const taskIds = await this.queueDAO.pop(taskType, count, timeout);
    if (taskIds.length === 0) return [];
    return this.executionDAO.getTasksByIds(taskIds);
  }

  async updateTask(taskId: string, result: TaskResult): Promise<TaskModel> {
    const task = await this.executionDAO.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = result.status;
    task.outputData = result.outputData ?? {};
    if (result.reasonForIncompletion) {
      task.reasonForIncompletion = result.reasonForIncompletion;
    }
    if (result.workerId) {
      task.workerId = result.workerId;
    }
    task.updateTime = Date.now();

    await this.executionDAO.updateTask(task);

    if (task.status && isTaskTerminal(task.status as TaskStatusType) && task.taskType) {
      await this.queueDAO.remove(task.taskType, taskId);
    }

    return task;
  }

  async updateTaskV2(result: TaskResult): Promise<TaskModel | undefined> {
    if (!result.taskId) throw new Error('taskId is required');
    const updated = await this.updateTask(result.taskId, result);
    if (!updated.taskType) return undefined;
    const taskIds = await this.queueDAO.pop(updated.taskType, 1, 200);
    if (!taskIds || taskIds.length === 0) return undefined;
    return this.executionDAO.getTask(taskIds[0]!);
  }

  async getTask(taskId: string): Promise<TaskModel | undefined> {
    return this.executionDAO.getTask(taskId);
  }

  async getQueueSize(taskType: string): Promise<number> {
    return this.queueDAO.getSize(taskType);
  }

  async getTaskQueueSizes(taskTypes: string[]): Promise<Record<string, number>> {
    const sizes: Record<string, number> = {};
    for (const t of taskTypes) {
      sizes[t] = await this.queueDAO.getSize(t);
    }
    return sizes;
  }

  async getTaskQueueSize(
    taskType: string,
    domain?: string,
    executionNamespace?: string,
    isolationGroupId?: string,
  ): Promise<number> {
    return this.queueDAO.getSize(taskType);
  }

  async allVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    return this.queueDAO.queuesDetailVerbose();
  }

  async getAllQueueDetails(): Promise<Record<string, number>> {
    return this.queueDAO.queuesDetail();
  }

  async getPollData(taskType: string): Promise<PollData[]> {
    return this.pollDataDAO.getPollDataForTask(taskType);
  }

  async getAllPollData(): Promise<PollData[]> {
    return this.pollDataDAO.getAllPollData();
  }

  async requeuePendingTask(taskType: string): Promise<string> {
    await this.queueDAO.flush(taskType);
    return 'true';
  }

  async log(taskId: string, logMessage: string): Promise<void> {
    const log: TaskExecLog = {
      log: logMessage,
      taskId,
      createdTime: Date.now(),
    };
    await this.executionDAO.addTaskLog(taskId, log);
  }

  async getTaskLogs(taskId: string): Promise<TaskExecLog[]> {
    return this.executionDAO.getTaskLogs(taskId);
  }

  async search(
    start: number,
    size: number,
    _sort?: string,
    _freeText?: string,
    query?: string,
  ): Promise<SearchResult<TaskModel>> {
    const allTasks: TaskModel[] = [];
    try {
      const pending = await this.executionDAO.getPendingTasksForTaskType('');
      const all = await this.executionDAO.getTasksByIds(pending.map(t => t.taskId!).filter(Boolean));
      allTasks.push(...all);
    } catch {
    }
    const filtered = query
      ? allTasks.filter((t) => JSON.stringify(t).toLowerCase().includes(query.toLowerCase()))
      : allTasks;
    const sliced = filtered.slice(start, start + size);
    return new SearchResult<TaskModel>(filtered.length, sliced);
  }

  async searchV2(
    start: number,
    size: number,
    sort?: string,
    freeText?: string,
    query?: string,
  ): Promise<SearchResult<TaskModel>> {
    return this.search(start, size, sort, freeText, query);
  }

  async getExternalStorageLocation(
    path: string,
    operation: string,
    payloadType: string,
  ): Promise<{ uri: string; path: string }> {
    return { uri: '', path };
  }

  async getTasksByRefName(workflowId: string, taskRefName: string): Promise<TaskModel[]> {
    const tasks = await this.executionDAO.getTasksForWorkflow(workflowId);
    return tasks.filter(t => t.referenceTaskName === taskRefName);
  }

  async getPendingTaskForWorkflow(workflowId: string, taskRefName: string): Promise<TaskModel | undefined> {
    const tasks = await this.getTasksByRefName(workflowId, taskRefName);
    return tasks.find((t) => t.status && !isTaskTerminal(t.status as TaskStatusType));
  }

  async getWorkflowForTask(taskId: string): Promise<WorkflowModel | undefined> {
    const task = await this.executionDAO.getTask(taskId);
    if (!task?.workflowInstanceId) return undefined;
    return this.executionDAO.getWorkflow(task.workflowInstanceId, true);
  }
}