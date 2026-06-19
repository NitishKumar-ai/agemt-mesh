import { IndexDAO } from '@agentmesh/common-persistence';
import { TaskModel, WorkflowModel, SearchResult, TaskExecLog, Message, EventExecution } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { types } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

const { TimeUuid } = types;

/**
 * Cassandra implementation of IndexDAO.
 *
 * Implements the storage/indexing methods (indexWorkflow, indexTask,
 * addTaskExecutionLogs, etc.) using Cassandra tables for persistence.
 *
 * Search methods (searchWorkflows, searchTasks, etc.) return empty results —
 * Cassandra has no full-text search capability. For production search, pair
 * this with an external search index (Elasticsearch, OpenSearch, etc.).
 *
 * Expected CQL schema:
 *   CREATE TABLE workflow_index (
 *     workflow_id text PRIMARY KEY,
 *     payload text
 *   );
 *
 *   CREATE TABLE task_index (
 *     workflow_id text,
 *     task_id text,
 *     payload text,
 *     PRIMARY KEY (workflow_id, task_id)
 *   );
 *
 *   CREATE TABLE task_execution_logs (
 *     task_id text,
 *     created_time timeuuid,
 *     payload text,
 *     PRIMARY KEY (task_id, created_time)
 *   ) WITH CLUSTERING ORDER BY (created_time ASC);
 *
 *   CREATE TABLE indexed_messages (
 *     queue_name text,
 *     message_id text,
 *     payload text,
 *     PRIMARY KEY (queue_name, message_id)
 *   );
 *
 *   CREATE TABLE indexed_event_executions (
 *     event_handler_name text,
 *     message_id text,
 *     payload text,
 *     PRIMARY KEY (event_handler_name, message_id)
 *   );
 */
export class CassandraIndexDAO extends CassandraBaseDAO implements IndexDAO {
  constructor(client: Client) {
    super(client);
  }

  async setup(): Promise<void> {
    // Schema is expected to be created externally (via migration scripts).
    // No-op at runtime.
  }

  // ── Workflow Indexing ────────────────────────────────────────────────

  async indexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.client.execute(
      'INSERT INTO workflow_index (workflow_id, payload) VALUES (?, ?)',
      [workflow.workflowId, JSON.stringify(workflow)],
      { prepare: true },
    );
  }

  async asyncIndexWorkflow(workflow: WorkflowModel): Promise<void> {
    await this.indexWorkflow(workflow);
  }

  // ── Task Indexing ────────────────────────────────────────────────────

  async indexTask(task: TaskModel): Promise<void> {
    await this.client.execute(
      'INSERT INTO task_index (workflow_id, task_id, payload) VALUES (?, ?, ?)',
      [task.workflowInstanceId, task.taskId, JSON.stringify(task)],
      { prepare: true },
    );
  }

  async asyncIndexTask(task: TaskModel): Promise<void> {
    await this.indexTask(task);
  }

  // ── Task Execution Logs ──────────────────────────────────────────────

  async addTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    const queries = logs.map((log) => ({
      query: 'INSERT INTO task_execution_logs (task_id, created_time, payload) VALUES (?, ?, ?)',
      params: [log.taskId, TimeUuid.now(), JSON.stringify(log)],
    }));
    await this.client.batch(queries, { prepare: true });
  }

  async asyncAddTaskExecutionLogs(logs: TaskExecLog[]): Promise<void> {
    await this.addTaskExecutionLogs(logs);
  }

  async getTaskExecutionLogs(taskId: string): Promise<TaskExecLog[]> {
    const result = await this.client.execute(
      'SELECT payload FROM task_execution_logs WHERE task_id = ? ORDER BY created_time ASC',
      [taskId],
      { prepare: true },
    );
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  // ── Message Indexing ─────────────────────────────────────────────────

  async addMessage(queue: string, message: Message): Promise<void> {
    await this.client.execute(
      'INSERT INTO indexed_messages (queue_name, message_id, payload) VALUES (?, ?, ?)',
      [queue, message.id, JSON.stringify(message)],
      { prepare: true },
    );
  }

  async asyncAddMessage(queue: string, message: Message): Promise<void> {
    await this.addMessage(queue, message);
  }

  async getMessages(queue: string): Promise<Message[]> {
    const result = await this.client.execute(
      'SELECT payload FROM indexed_messages WHERE queue_name = ?',
      [queue],
      { prepare: true },
    );
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  // ── Event Execution Indexing ─────────────────────────────────────────

  async addEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.client.execute(
      'INSERT INTO indexed_event_executions (event_handler_name, message_id, payload) VALUES (?, ?, ?)',
      [eventExecution.name, eventExecution.messageId, JSON.stringify(eventExecution)],
      { prepare: true },
    );
  }

  async asyncAddEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.addEventExecution(eventExecution);
  }

  async getEventExecutions(event: string): Promise<EventExecution[]> {
    const result = await this.client.execute(
      'SELECT payload FROM indexed_event_executions WHERE event_handler_name = ?',
      [event],
      { prepare: true },
    );
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  // ── Search (stubs — Cassandra has no full-text search) ───────────────

  async searchWorkflows(
    _query: string,
    _freeText: string,
    _start: number,
    _count: number,
    _sort: string[],
  ): Promise<SearchResult<string>> {
    return { totalHits: 0, results: [] };
  }

  async searchWorkflowSummary(
    _query: string,
    _freeText: string,
    _start: number,
    _count: number,
    _sort: string[],
  ): Promise<SearchResult<WorkflowModel>> {
    return { totalHits: 0, results: [] };
  }

  async searchTasks(
    _query: string,
    _freeText: string,
    _start: number,
    _count: number,
    _sort: string[],
  ): Promise<SearchResult<string>> {
    return { totalHits: 0, results: [] };
  }

  async searchTaskSummary(
    _query: string,
    _freeText: string,
    _start: number,
    _count: number,
    _sort: string[],
  ): Promise<SearchResult<TaskModel>> {
    return { totalHits: 0, results: [] };
  }

  // ── Remove Operations ────────────────────────────────────────────────

  async removeWorkflow(workflowId: string): Promise<void> {
    const queries: { query: string; params: any[] }[] = [
      { query: 'DELETE FROM workflow_index WHERE workflow_id = ?', params: [workflowId] },
      {
        query: 'SELECT task_id FROM task_index WHERE workflow_id = ?',
        params: [workflowId],
      },
    ];
    await this.client.batch(queries, { prepare: true });

    // Also clear tasks for this workflow
    const taskResult = await this.client.execute(
      'SELECT task_id FROM task_index WHERE workflow_id = ?',
      [workflowId],
      { prepare: true },
    );
    const deleteQueries = taskResult.rows.map((row) => ({
      query: 'DELETE FROM task_index WHERE workflow_id = ? AND task_id = ?',
      params: [workflowId, row.get('task_id')],
    }));
    if (deleteQueries.length > 0) {
      await this.client.batch(deleteQueries, { prepare: true });
    }
  }

  async asyncRemoveWorkflow(workflowId: string): Promise<void> {
    await this.removeWorkflow(workflowId);
  }

  // ── Update Operations ────────────────────────────────────────────────

  async updateWorkflow(workflowInstanceId: string, _keys: string[], _values: any[]): Promise<void> {
    // Cassandra doesn't support partial document updates without reading first.
    // Re-index the full workflow object by reading from the execution store.
    // This is a best-effort operation; the caller should use indexWorkflow instead.
    // For now, this is a no-op since we don't have access to the full workflow here.
  }

  async asyncUpdateWorkflow(workflowInstanceId: string, keys: string[], values: any[]): Promise<void> {
    await this.updateWorkflow(workflowInstanceId, keys, values);
  }

  async removeTask(workflowId: string, taskId: string): Promise<void> {
    await this.client.execute(
      'DELETE FROM task_index WHERE workflow_id = ? AND task_id = ?',
      [workflowId, taskId],
      { prepare: true },
    );
  }

  async asyncRemoveTask(workflowId: string, taskId: string): Promise<void> {
    await this.removeTask(workflowId, taskId);
  }

  async updateTask(
    workflowId: string,
    taskId: string,
    _keys: string[],
    _values: any[],
  ): Promise<void> {
    // Best-effort; caller should re-index via indexTask.
  }

  async asyncUpdateTask(
    workflowId: string,
    taskId: string,
    keys: string[],
    values: any[],
  ): Promise<void> {
    await this.updateTask(workflowId, taskId, keys, values);
  }

  // ── Utility Operations ───────────────────────────────────────────────

  async get(workflowInstanceId: string, fieldToGet: string): Promise<string> {
    const result = await this.client.execute(
      'SELECT payload FROM workflow_index WHERE workflow_id = ?',
      [workflowInstanceId],
      { prepare: true },
    );
    if (result.rowLength === 0) return '';

    const workflow = JSON.parse(result.first()!.get('payload') as string);
    return String(workflow[fieldToGet] ?? '');
  }

  async searchArchivableWorkflows(
    _indexName: string,
    _archiveTtlDays: number,
  ): Promise<string[]> {
    // Not supported in Cassandra — returns empty
    return [];
  }

  async getWorkflowCount(_query: string, _freeText: string): Promise<number> {
    // Not supported — Cassandra can't do free-text search counts
    return 0;
  }
}
