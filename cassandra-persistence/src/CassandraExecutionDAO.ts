import { ExecutionDAO } from '@agentmesh/common-persistence';
import { TaskModel, WorkflowModel, EventExecution, TaskExecLog } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

export class CassandraExecutionDAO extends CassandraBaseDAO implements ExecutionDAO {
  constructor(client: Client) {
    super(client);
  }

  async getPendingTasksByWorkflow(taskName: string, workflowId: string): Promise<TaskModel[]> {
    const tasks = await this.getTasksForWorkflow(workflowId);
    return tasks.filter((t) => t.taskDefName === taskName && t.status === 'IN_PROGRESS');
  }

  async getTasks(taskType: string, startKey: string, count: number): Promise<TaskModel[]> {
    const query = 'SELECT payload FROM tasks_in_progress WHERE task_type = ? LIMIT ?';
    const result = await this.client.execute(query, [taskType, count], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  async createTasks(tasks: TaskModel[]): Promise<TaskModel[]> {
    const queries = tasks.map((task) => ({
      query: 'INSERT INTO tasks (task_id, workflow_id, payload) VALUES (?, ?, ?)',
      params: [task.taskId, task.workflowInstanceId, JSON.stringify(task)],
    }));
    await this.client.batch(queries, { prepare: true });
    return tasks;
  }

  async updateTask(task: TaskModel): Promise<void> {
    const query = 'UPDATE tasks SET payload = ? WHERE task_id = ? AND workflow_id = ?';
    await this.client.execute(query, [JSON.stringify(task), task.taskId, task.workflowInstanceId], {
      prepare: true,
    });
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task) return false;
    const query = 'DELETE FROM tasks WHERE task_id = ? AND workflow_id = ?';
    await this.client.execute(query, [taskId, task.workflowInstanceId], { prepare: true });
    return true;
  }

  async getTask(taskId: string): Promise<TaskModel | undefined> {
    const query = 'SELECT payload FROM tasks WHERE task_id = ? ALLOW FILTERING';
    const result = await this.client.execute(query, [taskId], { prepare: true });
    if (result.rowLength === 0) return undefined;
    return JSON.parse(result.first().get('payload'));
  }

  async getTasksByIds(taskIds: string[]): Promise<TaskModel[]> {
    const tasks: TaskModel[] = [];
    for (const taskId of taskIds) {
      const task = await this.getTask(taskId);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async getPendingTasksForTaskType(taskType: string): Promise<TaskModel[]> {
    return this.getTasks(taskType, '', 100);
  }

  async getTasksForWorkflow(workflowId: string): Promise<TaskModel[]> {
    const query = 'SELECT payload FROM tasks WHERE workflow_id = ?';
    const result = await this.client.execute(query, [workflowId], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }

  async createWorkflow(workflow: WorkflowModel): Promise<string> {
    const query = 'INSERT INTO workflows (workflow_id, payload) VALUES (?, ?)';
    await this.client.execute(query, [workflow.workflowId, JSON.stringify(workflow)], {
      prepare: true,
    });
    return workflow.workflowId ?? '';
  }

  async updateWorkflow(workflow: WorkflowModel): Promise<string> {
    const query = 'UPDATE workflows SET payload = ? WHERE workflow_id = ?';
    await this.client.execute(query, [JSON.stringify(workflow), workflow.workflowId], {
      prepare: true,
    });
    return workflow.workflowId ?? '';
  }

  async removeWorkflow(workflowId: string): Promise<boolean> {
    const query = 'DELETE FROM workflows WHERE workflow_id = ?';
    await this.client.execute(query, [workflowId], { prepare: true });
    return true;
  }

  async removeWorkflowWithExpiry(workflowId: string, ttlSeconds: number): Promise<boolean> {
    return this.removeWorkflow(workflowId);
  }

  async removeFromPendingWorkflow(workflowType: string, workflowId: string): Promise<void> {
    const query = 'DELETE FROM pending_workflows WHERE workflow_type = ? AND workflow_id = ?';
    await this.client.execute(query, [workflowType, workflowId], { prepare: true });
  }

  async getWorkflow(
    workflowId: string,
    includeTasks: boolean = false,
  ): Promise<WorkflowModel | undefined> {
    const query = 'SELECT payload FROM workflows WHERE workflow_id = ?';
    const result = await this.client.execute(query, [workflowId], { prepare: true });
    if (result.rowLength === 0) return undefined;
    const workflow = JSON.parse(result.first().get('payload')) as WorkflowModel;
    if (includeTasks) {
      workflow.tasks = await this.getTasksForWorkflow(workflowId);
    }
    return workflow;
  }

  async getRunningWorkflowIds(workflowName: string, version: number): Promise<string[]> {
    const query = 'SELECT workflow_id FROM pending_workflows WHERE workflow_type = ?';
    const result = await this.client.execute(query, [workflowName], { prepare: true });
    return result.rows.map((row) => row.get('workflow_id'));
  }

  async getPendingWorkflowsByType(workflowName: string, version: number): Promise<WorkflowModel[]> {
    const ids = await this.getRunningWorkflowIds(workflowName, version);
    const workflows: WorkflowModel[] = [];
    for (const id of ids) {
      const wf = await this.getWorkflow(id, true);
      if (wf) workflows.push(wf);
    }
    return workflows;
  }

  async getPendingWorkflowCount(workflowName: string): Promise<number> {
    const ids = await this.getRunningWorkflowIds(workflowName, 0);
    return ids.length;
  }

  async getInProgressTaskCount(taskDefName: string): Promise<number> {
    const tasks = await this.getPendingTasksForTaskType(taskDefName);
    return tasks.length;
  }

  async getWorkflowsByType(
    workflowName: string,
    startTime: number,
    endTime: number,
  ): Promise<WorkflowModel[]> {
    return [];
  }

  async getWorkflowsByCorrelationId(
    workflowName: string,
    correlationId: string,
    includeTasks: boolean,
  ): Promise<WorkflowModel[]> {
    const query = 'SELECT workflow_id FROM workflow_correlation_index WHERE correlation_id = ?';
    const result = await this.client.execute(query, [correlationId], { prepare: true });
    const workflows: WorkflowModel[] = [];
    for (const row of result.rows) {
      const wf = await this.getWorkflow(row.get('workflow_id'), includeTasks);
      if (wf && wf.workflowName === workflowName) {
        workflows.push(wf);
      }
    }
    return workflows;
  }

  canSearchAcrossWorkflows(): boolean {
    return false;
  }

  async addEventExecution(eventExecution: EventExecution): Promise<boolean> {
    const query =
      'INSERT INTO event_executions (message_id, event_handler_name, event_name, payload) VALUES (?, ?, ?, ?)';
    await this.client.execute(
      query,
      [
        eventExecution.messageId,
        eventExecution.name,
        eventExecution.event,
        JSON.stringify(eventExecution),
      ],
      { prepare: true },
    );
    return true;
  }

  async updateEventExecution(eventExecution: EventExecution): Promise<void> {
    await this.addEventExecution(eventExecution);
  }

  async removeEventExecution(eventExecution: EventExecution): Promise<void> {
    const query = 'DELETE FROM event_executions WHERE message_id = ? AND event_handler_name = ?';
    await this.client.execute(query, [eventExecution.messageId, eventExecution.name], {
      prepare: true,
    });
  }

  async addTaskLog(taskId: string, log: TaskExecLog): Promise<void> {
    const query = 'INSERT INTO task_logs (task_id, log_time, payload) VALUES (?, ?, ?)';
    await this.client.execute(query, [taskId, Date.now(), JSON.stringify(log)], { prepare: true });
  }

  async getTaskLogs(taskId: string): Promise<TaskExecLog[]> {
    const query = 'SELECT payload FROM task_logs WHERE task_id = ?';
    const result = await this.client.execute(query, [taskId], { prepare: true });
    return result.rows.map((row) => JSON.parse(row.get('payload')));
  }
}
