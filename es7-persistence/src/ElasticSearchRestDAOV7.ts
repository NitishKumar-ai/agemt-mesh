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

export class ElasticSearchRestDAOV7 implements IndexDAO {
  private client: Client;
  private indexPrefix: string;

  constructor(client: Client, indexPrefix: string = 'agentmesh') {
    this.client = client;
    this.indexPrefix = indexPrefix;
  }

  private getIndexName(documentType: string): string {
    return `${this.indexPrefix}_${documentType}`;
  }

  async setup(): Promise<void> {
    // Basic setup implementation
    const workflowIndex = this.getIndexName('workflow');
    const taskIndex = this.getIndexName('task');

    const { body: workflowIndexExists } = await this.client.indices.exists({ index: workflowIndex });
    if (!workflowIndexExists) {
      await this.client.indices.create({ index: workflowIndex });
    }

    const { body: taskIndexExists } = await this.client.indices.exists({ index: taskIndex });
    if (!taskIndexExists) {
      await this.client.indices.create({ index: taskIndex });
    }
  }

  async indexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.client.index({
      index: this.getIndexName('workflow'),
      id: workflow.workflowId,
      body: workflow,
    });
  }

  async asyncIndexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.indexWorkflow(workflow);
  }

  async indexTask(task: TaskModel): Promise<void> {
    await this.client.index({
      index: this.getIndexName('task'),
      id: task.taskId,
      body: task,
    });
  }

  async asyncIndexTask(task: TaskModel): Promise<void> {
    await this.indexTask(task);
  }

  async addTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    if (logs.length === 0) return;
    
    const body = logs.flatMap(log => [
      { index: { _index: this.getIndexName('task_log') } },
      log
    ]);
    
    await this.client.bulk({ refresh: true, body });
  }

  async asyncAddTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    await this.addTaskExecutionLogs(logs);
  }

  async getTaskExecutionLogs(taskId: string): Promise<TaskExecLog[]> {
    const { body } = await this.client.search({
      index: this.getIndexName('task_log'),
      body: {
        query: {
          term: { taskId: taskId }
        }
      }
    });
    
    return body.hits.hits.map((hit: Record<string, unknown>) => hit._source as TaskExecLog);
  }

  async addMessage(queue: string, message: Message): Promise<void> {
    await this.client.index({
      index: this.getIndexName('message'),
      id: message.id,
      body: { ...message, queue },
    });
  }

  async asyncAddMessage(queue: string, message: Message): Promise<void> {
    await this.addMessage(queue, message);
  }

  async getMessages(queue: string): Promise<Message[]> {
    const { body } = await this.client.search({
      index: this.getIndexName('message'),
      body: {
        query: {
          term: { queue: queue }
        }
      }
    });
    return body.hits.hits.map((hit: Record<string, unknown>) => hit._source as Message);
  }

  async addEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.client.index({
      index: this.getIndexName('event_execution'),
      id: eventExecution.id,
      body: eventExecution,
    });
  }

  async asyncAddEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.addEventExecution(eventExecution);
  }

  async getEventExecutions(event: string): Promise<EventExecution[]> {
    const { body } = await this.client.search({
      index: this.getIndexName('event_execution'),
      body: {
        query: {
          term: { event: event }
        }
      }
    });
    return body.hits.hits.map((hit: Record<string, unknown>) => hit._source as EventExecution);
  }

  private buildQuery(query: string, freeText: string): Record<string, unknown> {
    const boolQuery: { must: Record<string, unknown>[] } = { must: [] };
    
    if (freeText && freeText !== '*') {
      boolQuery.must.push({ query_string: { query: freeText } });
    } else {
      boolQuery.must.push({ match_all: {} });
    }
    
    // In a real implementation, 'query' would be parsed using a custom parser
    // like GroupedExpression/Expression in the Java code.
    if (query && query !== '') {
      boolQuery.must.push({ query_string: { query: query } });
    }
    
    return { bool: boolQuery };
  }

  async searchWorkflows(
    query: string,
    freeText: string,
    start: number,
    count: number,
    _sort: string[],
  ): Promise<SearchResult<string>> {
    const { body } = await this.client.search({
      index: this.getIndexName('workflow'),
      from: start,
      size: count,
      body: {
        query: this.buildQuery(query, freeText)
      }
    });

    const results = body.hits.hits.map((hit: Record<string, unknown>) => hit._id);
    return {
      totalHits: body.hits.total.value,
      results
    };
  }

  async searchWorkflowSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    _sort: string[],
  ): Promise<SearchResult<WorkflowModel>> {
    const { body } = await this.client.search({
      index: this.getIndexName('workflow'),
      from: start,
      size: count,
      body: {
        query: this.buildQuery(query, freeText)
      }
    });

    const results = body.hits.hits.map((hit: Record<string, unknown>) => hit._source as WorkflowModel);
    return {
      totalHits: body.hits.total.value,
      results
    };
  }

  async searchTasks(
    query: string,
    freeText: string,
    start: number,
    count: number,
    _sort: string[],
  ): Promise<SearchResult<string>> {
    const { body } = await this.client.search({
      index: this.getIndexName('task'),
      from: start,
      size: count,
      body: {
        query: this.buildQuery(query, freeText)
      }
    });

    const results = body.hits.hits.map((hit: Record<string, unknown>) => hit._id);
    return {
      totalHits: body.hits.total.value,
      results
    };
  }

  async searchTaskSummary(
    query: string,
    freeText: string,
    start: number,
    count: number,
    _sort: string[],
  ): Promise<SearchResult<TaskModel>> {
    const { body } = await this.client.search({
      index: this.getIndexName('task'),
      from: start,
      size: count,
      body: {
        query: this.buildQuery(query, freeText)
      }
    });

    const results = body.hits.hits.map((hit: Record<string, unknown>) => hit._source as TaskModel);
    return {
      totalHits: body.hits.total.value,
      results
    };
  }

  async removeWorkflow(workflowId: string): Promise<void> {
    await this.client.delete({
      index: this.getIndexName('workflow'),
      id: workflowId,
    }).catch(e => {
      if (e.meta?.statusCode !== 404) throw e;
    });
  }

  async asyncRemoveWorkflow(workflowId: string): Promise<void> {
    await this.removeWorkflow(workflowId);
  }

  async removeTask(workflowId: string, taskId: string): Promise<void> {
    await this.client.delete({
      index: this.getIndexName('task'),
      id: taskId,
    }).catch(e => {
      if (e.meta?.statusCode !== 404) throw e;
    });
  }

  async asyncRemoveTask(workflowId: string, taskId: string): Promise<void> {
    await this.removeTask(workflowId, taskId);
  }

  async updateWorkflow(workflowInstanceId: string, keys: string[], values: unknown[]): Promise<void> {
    const doc: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]; if (key !== undefined) doc[key] = values[i];
    }
    await this.client.update({
      index: this.getIndexName('workflow'),
      id: workflowInstanceId,
      body: {
        doc
      }
    }).catch(e => {
      if (e.meta?.statusCode !== 404) throw e;
    });
  }

  async asyncUpdateWorkflow(workflowInstanceId: string, keys: string[], values: unknown[]): Promise<void> {
    await this.updateWorkflow(workflowInstanceId, keys, values);
  }

  async updateTask(workflowId: string, taskId: string, keys: string[], values: unknown[]): Promise<void> {
    const doc: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]; if (key !== undefined) doc[key] = values[i];
    }
    await this.client.update({
      index: this.getIndexName('task'),
      id: taskId,
      body: {
        doc
      }
    }).catch(e => {
      if (e.meta?.statusCode !== 404) throw e;
    });
  }

  async asyncUpdateTask(workflowId: string, taskId: string, keys: string[], values: unknown[]): Promise<void> {
    await this.updateTask(workflowId, taskId, keys, values);
  }

  async get(workflowInstanceId: string, fieldToGet: string): Promise<string> {
    const { body } = await this.client.get({
      index: this.getIndexName('workflow'),
      id: workflowInstanceId,
      _source: [fieldToGet]
    });
    
    return body._source ? body._source[fieldToGet] : ("" as unknown as string);
  }

  async searchArchivableWorkflows(indexName: string, archiveTtlDays: number): Promise<string[]> {
    const { body } = await this.client.search({
      index: this.getIndexName('workflow'),
      body: {
        query: {
          bool: {
            must: [
              { range: { updateTime: { lt: `now-${archiveTtlDays}d` } } }
            ],
            should: [
              { term: { status: 'COMPLETED' } },
              { term: { status: 'FAILED' } },
              { term: { status: 'TIMED_OUT' } },
              { term: { status: 'TERMINATED' } }
            ],
            minimum_should_match: 1,
            must_not: [
              { exists: { field: 'archived' } }
            ]
          }
        }
      }
    });
    
    return body.hits.hits.map((hit: Record<string, unknown>) => hit._id);
  }

  async getWorkflowCount(query: string, freeText: string): Promise<number> {
    const { body } = await this.client.count({
      index: this.getIndexName('workflow'),
      body: {
        query: this.buildQuery(query, freeText)
      }
    });
    
    return body.count;
  }
}
