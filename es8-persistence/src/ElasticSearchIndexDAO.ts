import { Client } from '@elastic/elasticsearch';
import {
  TaskModel,
  WorkflowModel,
  SearchResult,
  TaskExecLog,
  Message,
  EventExecution,
} from '@agentmesh/common';
import { IndexDAO } from '@agentmesh/common-persistence';

export interface ElasticSearchProperties {
  url?: string;
  indexPrefix?: string;
}

export class ElasticSearchIndexDAO implements IndexDAO {
  private client: Client;
  private indexPrefix: string;
  private workflowIndexName: string;
  private taskIndexName: string;
  private eventIndexName: string;
  private messageIndexName: string;
  private taskExecLogIndexName: string;

  constructor(client: Client, properties: ElasticSearchProperties = {}) {
    this.client = client;
    this.indexPrefix = properties.indexPrefix || 'conductor';
    this.workflowIndexName = `${this.indexPrefix}_workflow`;
    this.taskIndexName = `${this.indexPrefix}_task`;
    this.eventIndexName = `${this.indexPrefix}_event`;
    this.messageIndexName = `${this.indexPrefix}_message`;
    this.taskExecLogIndexName = `${this.indexPrefix}_task_exec_log`;
  }

  async setup(): Promise<void> {
    const indices = [
      this.workflowIndexName,
      this.taskIndexName,
      this.eventIndexName,
      this.messageIndexName,
      this.taskExecLogIndexName,
    ];
    for (const index of indices) {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({ index });
      }
    }
  }

  async indexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.client.index({
      index: this.workflowIndexName,
      id: workflow.workflowId,
      document: workflow,
    });
  }

  async asyncIndexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.indexWorkflow(workflow);
  }

  async indexTask(task: TaskModel): Promise<void> {
    await this.client.index({
      index: this.taskIndexName,
      id: task.taskId,
      document: task,
    });
  }

  async asyncIndexTask(task: TaskModel): Promise<void> {
    await this.indexTask(task);
  }

  async addTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    const operations = logs.flatMap((log) => [
      { index: { _index: this.taskExecLogIndexName } },
      log,
    ]);
    if (operations.length > 0) {
      await this.client.bulk({ operations });
    }
  }

  async asyncAddTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    await this.addTaskExecutionLogs(logs);
  }

  async getTaskExecutionLogs(taskId: string): Promise<TaskExecLog[]> {
    const response = await this.client.search<TaskExecLog>({
      index: this.taskExecLogIndexName,
      query: { term: { taskId } },
      sort: [{ createdTime: { order: 'asc' } }],
    });
    return response.hits.hits.map((hit) => hit._source!);
  }

  async addMessage(queue: string, message: Message): Promise<void> {
    await this.client.index({
      index: this.messageIndexName,
      id: message.id,
      document: { ...message, queue },
    });
  }

  async asyncAddMessage(queue: string, message: Message): Promise<void> {
    await this.addMessage(queue, message);
  }

  async getMessages(queue: string): Promise<Message[]> {
    const response = await this.client.search<Message>({
      index: this.messageIndexName,
      query: { term: { queue } },
    });
    return response.hits.hits.map((hit) => hit._source!);
  }

  async addEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.client.index({
      index: this.eventIndexName,
      id: eventExecution.id,
      document: eventExecution,
    });
  }

  async asyncAddEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.addEventExecution(eventExecution);
  }

  async getEventExecutions(event: string): Promise<EventExecution[]> {
    const response = await this.client.search<EventExecution>({
      index: this.eventIndexName,
      query: { term: { event } },
    });
    return response.hits.hits.map((hit) => hit._source!);
  }

  async searchWorkflows(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[]
  ): Promise<SearchResult<string>> {
    const response = await this.client.search({
      index: this.workflowIndexName,
      from: start,
      size: count,
      query: this.buildQuery(query, freeText),
    });
    const results = response.hits.hits.map((hit) => hit._id as string);
    return {
      results,
      totalHits: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    };
  }

  async searchWorkflowSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[]
  ): Promise<SearchResult<WorkflowModel>> {
    const response = await this.client.search<WorkflowModel>({
      index: this.workflowIndexName,
      from: start,
      size: count,
      query: this.buildQuery(query, freeText),
    });
    const results = response.hits.hits.map((hit) => hit._source!);
    return {
      results,
      totalHits: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    };
  }

  async searchTasks(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[]
  ): Promise<SearchResult<string>> {
    const response = await this.client.search({
      index: this.taskIndexName,
      from: start,
      size: count,
      query: this.buildQuery(query, freeText),
    });
    const results = response.hits.hits.map((hit) => hit._id as string);
    return {
      results,
      totalHits: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    };
  }

  async searchTaskSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    sort: string[]
  ): Promise<SearchResult<TaskModel>> {
    const response = await this.client.search<TaskModel>({
      index: this.taskIndexName,
      from: start,
      size: count,
      query: this.buildQuery(query, freeText),
    });
    const results = response.hits.hits.map((hit) => hit._source!);
    return {
      results,
      totalHits: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    };
  }

  async removeWorkflow(workflowId: string): Promise<void> {
    await this.client.delete({
      index: this.workflowIndexName,
      id: workflowId,
    }).catch(e => { if (e.meta?.statusCode !== 404) throw e; });
  }

  async asyncRemoveWorkflow(workflowId: string): Promise<void> {
    await this.removeWorkflow(workflowId);
  }

  async updateWorkflow(workflowInstanceId: string, keys: string[], values: any[]): Promise<void> {
    const doc: any = {};
    keys.forEach((key, i) => {
      doc[key] = values[i];
    });
    await this.client.update({
      index: this.workflowIndexName,
      id: workflowInstanceId,
      doc,
    }).catch(e => { if (e.meta?.statusCode !== 404) throw e; });
  }

  async asyncUpdateWorkflow(workflowInstanceId: string, keys: string[], values: any[]): Promise<void> {
    await this.updateWorkflow(workflowInstanceId, keys, values);
  }

  async removeTask(workflowId: string, taskId: string): Promise<void> {
    await this.client.delete({
      index: this.taskIndexName,
      id: taskId,
    }).catch(e => { if (e.meta?.statusCode !== 404) throw e; });
  }

  async asyncRemoveTask(workflowId: string, taskId: string): Promise<void> {
    await this.removeTask(workflowId, taskId);
  }

  async updateTask(workflowId: string, taskId: string, keys: string[], values: any[]): Promise<void> {
    const doc: any = {};
    keys.forEach((key, i) => {
      doc[key] = values[i];
    });
    await this.client.update({
      index: this.taskIndexName,
      id: taskId,
      doc,
    }).catch(e => { if (e.meta?.statusCode !== 404) throw e; });
  }

  async asyncUpdateTask(workflowId: string, taskId: string, keys: string[], values: any[]): Promise<void> {
    await this.updateTask(workflowId, taskId, keys, values);
  }

  async get(workflowInstanceId: string, fieldToGet: string): Promise<string> {
    try {
      const response = await this.client.get({
        index: this.workflowIndexName,
        id: workflowInstanceId,
      });
      const source = response._source as any;
      if (source && source[fieldToGet] !== undefined) {
        return String(source[fieldToGet]);
      }
    } catch (e: any) {
      if (e.meta?.statusCode !== 404) {
        throw e;
      }
    }
    return '';
  }

  async searchArchivableWorkflows(indexName: string, archiveTtlDays: number): Promise<string[]> {
    const cutoff = Date.now() - archiveTtlDays * 24 * 60 * 60 * 1000;
    const response = await this.client.search({
      index: indexName,
      query: {
        range: {
          updateTime: {
            lt: cutoff,
          },
        },
      },
      size: 1000,
    });
    return response.hits.hits.map(hit => hit._id as string);
  }

  async getWorkflowCount(query: string, freeText: string): Promise<number> {
    const response = await this.client.count({
      index: this.workflowIndexName,
      query: this.buildQuery(query, freeText),
    });
    return response.count;
  }

  private buildQuery(query: string, freeText: string): any {
    const must: any[] = [];
    if (query) {
      must.push({ query_string: { query } });
    }
    if (freeText && freeText !== '*') {
      must.push({ query_string: { query: freeText } });
    }
    if (must.length === 0) {
      return { match_all: {} };
    }
    return { bool: { must } };
  }
}
