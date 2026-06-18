import { Kysely, sql, Transaction } from 'kysely';
import {
  ExecutionDAO,
  ConcurrentExecutionLimitDAO,
  RateLimitingDAO,
  Database,
} from './index.js';
import {
  TaskModel,
  WorkflowModel,
  EventExecution,
  TaskDef,
  TaskStatus,
  TaskExecLog,
  isWorkflowTerminal,
  isTaskTerminal,
} from '@conductor/common';

export abstract class BaseKyselyExecutionDAO
  implements ExecutionDAO, ConcurrentExecutionLimitDAO, RateLimitingDAO
{
  constructor(protected readonly db: Kysely<Database>) {}

  protected abstract booleanTrue(): unknown;
  protected abstract booleanFalse(): unknown;
  protected abstract toBoolean(val: boolean): unknown;

  protected abstract doInsertTask(
    tx: Transaction<Database>,
    task: TaskModel,
  ): Promise<void>;

  protected dateStr(timeInMs?: number): string {
    const date = timeInMs ? new Date(timeInMs) : new Date();
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  async getPendingTasksByWorkflow(taskDefName: string, workflowId: string): Promise<TaskModel[]> {
    const rows = await this.db
      .selectFrom('task_in_progress as tip')
      .innerJoin('task as t', 't.task_id', 'tip.task_id')
      .select('t.json_data')
      .where('tip.task_def_name', '=', taskDefName)
      .where('tip.workflow_id', '=', workflowId)
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getTasks(taskType: string, startKey: string | null, count: number): Promise<TaskModel[]> {
    const query = this.db
      .selectFrom('task_in_progress as tip')
      .innerJoin('task as t', 't.task_id', 'tip.task_id')
      .select('t.json_data')
      .where('tip.task_def_name', '=', taskType)
      .orderBy('tip.created_on asc');

    if (startKey) {
      const startRow = await this.db
        .selectFrom('task_in_progress as tip')
        .select('tip.created_on')
        .where('tip.task_def_name', '=', taskType)
        .where('tip.task_id', '=', startKey)
        .executeTakeFirst();

      if (startRow) {
        query.where('tip.created_on', '>', startRow.created_on);
      }
    }

    const rows = await query.limit(count).execute();
    return rows.map((r) => JSON.parse(r.json_data));
  }

  async createTasks(tasks: TaskModel[]): Promise<TaskModel[]> {
    const created: TaskModel[] = [];

    await this.db.transaction().execute(async (tx) => {
      for (const task of tasks) {
        this.validateTask(task);
        task.scheduledTime = Date.now();

        const taskKey = this.getTaskKey(task);
        const scheduledTaskAdded = await this.addScheduledTask(tx, task, taskKey);

        if (!scheduledTaskAdded) {
          continue;
        }

        await this.insertOrUpdateTaskData(tx, task);
        await this.addWorkflowToTaskMapping(tx, task);
        await this.addTaskInProgress(tx, task);
        await this.updateTaskInternal(tx, task);

        created.push(task);
      }
    });

    return created;
  }

  async updateTask(task: TaskModel): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.updateTaskInternal(tx, task);
    });
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task) {
      return false;
    }

    const taskKey = this.getTaskKey(task);

    await this.db.transaction().execute(async (tx) => {
      await this.removeScheduledTask(tx, task, taskKey);
      await this.removeWorkflowToTaskMapping(tx, task);
      await this.removeTaskInProgress(tx, task);
      await this.removeTaskData(tx, task);
    });
    return true;
  }

  async getTask(taskId: string): Promise<TaskModel | undefined> {
    const row = await this.db
      .selectFrom('task')
      .select('json_data')
      .where('task_id', '=', taskId)
      .executeTakeFirst();

    return row ? JSON.parse(row.json_data) : undefined;
  }

  async getTasksByIds(taskIds: string[]): Promise<TaskModel[]> {
    if (taskIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('task')
      .select('json_data')
      .where('task_id', 'in', taskIds)
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getPendingTasksForTaskType(taskType: string): Promise<TaskModel[]> {
    const rows = await this.db
      .selectFrom('task_in_progress as tip')
      .innerJoin('task as t', 't.task_id', 'tip.task_id')
      .select('t.json_data')
      .where('tip.task_def_name', '=', taskType)
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getTasksForWorkflow(workflowId: string): Promise<TaskModel[]> {
    const rows = await this.db
      .selectFrom('workflow_to_task')
      .select('task_id')
      .where('workflow_id', '=', workflowId)
      .execute();

    const taskIds = rows.map((r) => r.task_id);
    return this.getTasksByIds(taskIds);
  }

  async createWorkflow(workflow: WorkflowModel): Promise<string> {
    return this.insertOrUpdateWorkflow(workflow, false);
  }

  async updateWorkflow(workflow: WorkflowModel): Promise<string> {
    return this.insertOrUpdateWorkflow(workflow, true);
  }

  async removeWorkflow(workflowId: string): Promise<boolean> {
    const workflow = await this.getWorkflow(workflowId, true);
    if (!workflow) return false;

    await this.db.transaction().execute(async (tx) => {
      await this.removeWorkflowDefToWorkflowMapping(tx, workflow);
      await this.removeWorkflowInternal(tx, workflowId);
      await this.removePendingWorkflow(tx, workflow.workflowType!, workflowId);
    });

    for (const task of workflow.tasks) {
      await this.removeTask(task.taskId!);
    }
    return true;
  }

  async removeWorkflowWithExpiry(workflowId: string, ttlSeconds: number): Promise<boolean> {
    setTimeout(() => {
      this.removeWorkflow(workflowId).catch((err) => {
        console.warn(`Unable to remove workflow: ${workflowId} with expiry`, err);
      });
    }, ttlSeconds * 1000);
    return true;
  }

  async removeFromPendingWorkflow(workflowType: string, workflowId: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.removePendingWorkflow(tx, workflowType, workflowId);
    });
  }

  async getWorkflow(
    workflowId: string,
    includeTasks: boolean = true,
  ): Promise<WorkflowModel | undefined> {
    const row = await this.db
      .selectFrom('workflow')
      .select('json_data')
      .where('workflow_id', '=', workflowId)
      .executeTakeFirst();

    if (!row) return undefined;

    const workflow: WorkflowModel = JSON.parse(row.json_data);
    if (includeTasks) {
      const tasks = await this.getTasksForWorkflow(workflowId);
      tasks.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      workflow.tasks = tasks;
    }
    return workflow;
  }

  async getWorkflowsByType(
    workflowName: string,
    startTime: number,
    endTime: number,
  ): Promise<WorkflowModel[]> {
    const rows = await this.db
      .selectFrom('workflow')
      .innerJoin('workflow_def_to_workflow as wd', 'workflow.workflow_id', 'wd.workflow_id')
      .select('workflow.json_data')
      .where('wd.workflow_def', '=', workflowName)
      .where('wd.date_str', '>=', this.dateStr(startTime))
      .where('wd.date_str', '<=', this.dateStr(endTime))
      .execute();

    return rows
      .map((r) => JSON.parse(r.json_data) as WorkflowModel)
      .filter((wf) => wf.createTime! >= startTime && wf.createTime! <= endTime);
  }

  async getWorkflowsByCorrelationId(
    workflowName: string,
    correlationId: string,
    includeTasks: boolean,
  ): Promise<WorkflowModel[]> {
    const rows = await this.db
      .selectFrom('workflow as w')
      .leftJoin('workflow_def_to_workflow as wd', 'w.workflow_id', 'wd.workflow_id')
      .select('w.json_data')
      .where('w.correlation_id', '=', correlationId)
      .where('wd.workflow_def', '=', workflowName)
      .execute();

    const workflows = rows.map((r) => JSON.parse(r.json_data) as WorkflowModel);
    if (includeTasks) {
      for (const wf of workflows) {
        const tasks = await this.getTasksForWorkflow(wf.workflowId!);
        tasks.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        wf.tasks = tasks;
      }
    }
    return workflows;
  }

  async getPendingWorkflowsByType(workflowName: string, version: number): Promise<WorkflowModel[]> {
    const rows = await this.db
      .selectFrom('workflow_pending')
      .select('workflow_id')
      .where('workflow_type', '=', workflowName)
      .execute();

    const workflows: WorkflowModel[] = [];
    for (const r of rows) {
      const wf = await this.getWorkflow(r.workflow_id, true);
      if (wf && wf.workflowVersion === version) {
        workflows.push(wf);
      }
    }
    return workflows;
  }

  async getRunningWorkflowIds(workflowName: string, _version: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('workflow_pending')
      .select('workflow_id')
      .where('workflow_type', '=', workflowName)
      .execute();

    return rows.map((r) => r.workflow_id);
  }

  async getWorkflowIdsByType(
    workflowName: string,
    startTime: number,
    endTime: number,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('workflow_def_to_workflow')
      .select('workflow_id')
      .where('workflow_def', '=', workflowName)
      .where('date_str', '>=', this.dateStr(startTime))
      .where('date_str', '<=', this.dateStr(endTime))
      .execute();

    return rows.map((r) => r.workflow_id);
  }

  async getPendingWorkflowCount(workflowName: string): Promise<number> {
    const row = await this.db
      .selectFrom('workflow_pending')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('workflow_type', '=', workflowName)
      .executeTakeFirst();
    return Number(row?.count || 0);
  }

  canSearchAcrossWorkflows(): boolean {
    return true;
  }

  async addEventExecution(ee: EventExecution): Promise<boolean> {
    const result = await this.db
      .insertInto('event_execution')
      .values({
        event_handler_name: ee.name!,
        event_name: ee.event!,
        message_id: ee.messageId!,
        execution_id: ee.id!,
        json_data: JSON.stringify(ee),
      })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst();

    return result.numInsertedOrUpdatedRows! > 0n;
  }

  async updateEventExecution(ee: EventExecution): Promise<void> {
    await this.db
      .updateTable('event_execution')
      .set({
        json_data: JSON.stringify(ee),
        modified_on: sql`CURRENT_TIMESTAMP`,
      })
      .where('event_handler_name', '=', ee.name!)
      .where('event_name', '=', ee.event!)
      .where('message_id', '=', ee.messageId!)
      .where('execution_id', '=', ee.id!)
      .execute();
  }

  async removeEventExecution(ee: EventExecution): Promise<void> {
    await this.db
      .deleteFrom('event_execution')
      .where('event_handler_name', '=', ee.name!)
      .where('event_name', '=', ee.event!)
      .where('message_id', '=', ee.messageId!)
      .where('execution_id', '=', ee.id!)
      .execute();
  }

  async getEventExecutions(
    eventHandlerName: string,
    eventName: string,
    messageId: string,
    max: number,
  ): Promise<EventExecution[]> {
    const rows = await this.db
      .selectFrom('event_execution')
      .select('json_data')
      .where('event_handler_name', '=', eventHandlerName)
      .where('event_name', '=', eventName)
      .where('message_id', '=', messageId)
      .orderBy('execution_id', 'asc')
      .limit(max)
      .execute();

    return rows.map((r) => JSON.parse(r.json_data) as EventExecution);
  }

  async addTaskLog(taskId: string, log: TaskExecLog): Promise<void> {
    await this.db
      .insertInto('task_log')
      .values({
        task_id: taskId,
        json_data: JSON.stringify(log),
      })
      .execute();
  }

  async getTaskLogs(taskId: string): Promise<TaskExecLog[]> {
    const rows = await this.db
      .selectFrom('task_log')
      .select('json_data')
      .where('task_id', '=', taskId)
      .orderBy('created_on', 'asc')
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async addTaskToLimit(_task: TaskModel): Promise<void> {}

  async removeTaskFromLimit(_task: TaskModel): Promise<void> {}

  async exceedsLimit(task: TaskModel): Promise<boolean> {
    const taskDef = task.taskDefinition;
    if (!taskDef || (taskDef.concurrentExecLimit || 0) <= 0) {
      return false;
    }

    const limit = taskDef.concurrentExecLimit!;
    const current = await this.getInProgressTaskCount(task.taskDefName!);

    if (current >= limit) {
      return true;
    }

    const tasksInProgress = await this.findAllTasksInProgressInOrderOfArrival(
      task.taskDefName!,
      limit,
    );
    return !tasksInProgress.includes(task.taskId!);
  }

  async getInProgressTaskCount(taskDefName: string): Promise<number> {
    const row = await this.db
      .selectFrom('task_in_progress')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('task_def_name', '=', taskDefName)
      .where('in_progress_status', '=', this.booleanTrue() as any)
      .executeTakeFirst();
    return Number(row?.count || 0);
  }

  async exceedsRateLimitPerFrequency(_task: TaskModel, _taskDef: TaskDef): Promise<boolean> {
    return false;
  }

  private async insertOrUpdateWorkflow(workflow: WorkflowModel, update: boolean): Promise<string> {
    const terminal = workflow.status ? isWorkflowTerminal(workflow.status) : false;
    const tasks = workflow.tasks;
    workflow.tasks = [];

    await this.db.transaction().execute(async (tx) => {
      if (!update) {
        await this.addWorkflowInternal(tx, workflow);
        await this.addWorkflowDefToWorkflowMapping(tx, workflow);
      } else {
        await this.updateWorkflowInternal(tx, workflow);
      }

      if (terminal) {
        await this.removePendingWorkflow(tx, workflow.workflowType!, workflow.workflowId!);
      } else {
        await this.addPendingWorkflow(tx, workflow.workflowType!, workflow.workflowId!);
      }
    });

    workflow.tasks = tasks;
    return workflow.workflowId!;
  }

  private async addWorkflowInternal(
    tx: Transaction<Database>,
    workflow: WorkflowModel,
  ): Promise<void> {
    await tx
      .insertInto('workflow')
      .values({
        workflow_id: workflow.workflowId!,
        correlation_id: workflow.correlationId || null,
        json_data: JSON.stringify(workflow),
      })
      .execute();
  }

  private async updateWorkflowInternal(
    tx: Transaction<Database>,
    workflow: WorkflowModel,
  ): Promise<void> {
    await tx
      .updateTable('workflow')
      .set({
        json_data: JSON.stringify(workflow),
        modified_on: sql`CURRENT_TIMESTAMP`,
      })
      .where('workflow_id', '=', workflow.workflowId!)
      .execute();
  }

  private async removeWorkflowInternal(
    tx: Transaction<Database>,
    workflowId: string,
  ): Promise<void> {
    await tx.deleteFrom('workflow').where('workflow_id', '=', workflowId).execute();
  }

  private async addPendingWorkflow(
    tx: Transaction<Database>,
    workflowType: string,
    workflowId: string,
  ): Promise<void> {
    await tx
      .insertInto('workflow_pending')
      .values({ workflow_type: workflowType, workflow_id: workflowId })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  private async removePendingWorkflow(
    tx: Transaction<Database>,
    workflowType: string,
    workflowId: string,
  ): Promise<void> {
    await tx
      .deleteFrom('workflow_pending')
      .where('workflow_type', '=', workflowType)
      .where('workflow_id', '=', workflowId)
      .execute();
  }

  private async updateTaskInternal(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    const taskDef = task.taskDefinition;
    if (taskDef && (taskDef.concurrentExecLimit || 0) > 0) {
      const inProgress = task.status === TaskStatus.IN_PROGRESS;
      await this.updateInProgressStatus(tx, task, inProgress);
    }

    await this.insertOrUpdateTaskData(tx, task);

    if (task.status && isTaskTerminal(task.status)) {
      await this.removeTaskInProgress(tx, task);
    }

    await this.addWorkflowToTaskMapping(tx, task);
  }

  private async insertOrUpdateTaskData(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    const result = await tx
      .updateTable('task')
      .set({
        json_data: JSON.stringify(task),
        modified_on: sql`CURRENT_TIMESTAMP`,
      })
      .where('task_id', '=', task.taskId!)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      await this.doInsertTask(tx, task);
    }
  }

  private async removeTaskData(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx.deleteFrom('task').where('task_id', '=', task.taskId!).execute();
  }

  private async addWorkflowToTaskMapping(
    tx: Transaction<Database>,
    task: TaskModel,
  ): Promise<void> {
    await tx
      .insertInto('workflow_to_task')
      .values({
        workflow_id: task.workflowInstanceId!,
        task_id: task.taskId!,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  private async removeWorkflowToTaskMapping(
    tx: Transaction<Database>,
    task: TaskModel,
  ): Promise<void> {
    await tx
      .deleteFrom('workflow_to_task')
      .where('workflow_id', '=', task.workflowInstanceId!)
      .where('task_id', '=', task.taskId!)
      .execute();
  }

  private async addWorkflowDefToWorkflowMapping(
    tx: Transaction<Database>,
    workflow: WorkflowModel,
  ): Promise<void> {
    await tx
      .insertInto('workflow_def_to_workflow')
      .values({
        workflow_def: workflow.workflowName!,
        date_str: this.dateStr(workflow.createTime),
        workflow_id: workflow.workflowId!,
      })
      .execute();
  }

  private async removeWorkflowDefToWorkflowMapping(
    tx: Transaction<Database>,
    workflow: WorkflowModel,
  ): Promise<void> {
    await tx
      .deleteFrom('workflow_def_to_workflow')
      .where('workflow_def', '=', workflow.workflowName!)
      .where('date_str', '=', this.dateStr(workflow.createTime))
      .where('workflow_id', '=', workflow.workflowId!)
      .execute();
  }

  private async addScheduledTask(
    tx: Transaction<Database>,
    task: TaskModel,
    taskKey: string,
  ): Promise<boolean> {
    const result = await tx
      .insertInto('task_scheduled')
      .values({
        workflow_id: task.workflowInstanceId!,
        task_key: taskKey,
        task_id: task.taskId!,
      })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst();

    return result.numInsertedOrUpdatedRows! > 0n;
  }

  private async removeScheduledTask(
    tx: Transaction<Database>,
    task: TaskModel,
    taskKey: string,
  ): Promise<void> {
    await tx
      .deleteFrom('task_scheduled')
      .where('workflow_id', '=', task.workflowInstanceId!)
      .where('task_key', '=', taskKey)
      .execute();
  }

  private async addTaskInProgress(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx
      .insertInto('task_in_progress')
      .values({
        task_def_name: task.taskDefName || task.taskType!,
        task_id: task.taskId!,
        workflow_id: task.workflowInstanceId!,
        in_progress_status: this.toBoolean(task.status === TaskStatus.IN_PROGRESS) as any,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  private async removeTaskInProgress(tx: Transaction<Database>, task: TaskModel): Promise<void> {
    await tx
      .deleteFrom('task_in_progress')
      .where('task_def_name', '=', task.taskDefName || task.taskType!)
      .where('task_id', '=', task.taskId!)
      .execute();
  }

  private async updateInProgressStatus(
    tx: Transaction<Database>,
    task: TaskModel,
    inProgress: boolean,
  ): Promise<void> {
    await tx
      .updateTable('task_in_progress')
      .set({
        in_progress_status: this.toBoolean(inProgress) as any,
        modified_on: sql`CURRENT_TIMESTAMP`,
      })
      .where('task_def_name', '=', task.taskDefName || task.taskType!)
      .where('task_id', '=', task.taskId!)
      .execute();
  }

  private async findAllTasksInProgressInOrderOfArrival(
    taskDefName: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('task_in_progress')
      .select('task_id')
      .where('task_def_name', '=', taskDefName)
      .orderBy('created_on', 'asc')
      .limit(limit)
      .execute();

    return rows.map((r) => r.task_id);
  }

  private getTaskKey(task: TaskModel): string {
    return `${task.referenceTaskName}_${task.retryCount}`;
  }

  private validateTask(task: TaskModel): void {
    if (!task.taskId) throw new Error('Task id cannot be null');
    if (!task.workflowInstanceId) throw new Error('Workflow instance id cannot be null');
    if (!task.referenceTaskName) throw new Error('Task reference name cannot be null');
  }
}
