import { isWorkflowTerminal, isTaskTerminal } from '@conductor/common';
import type { TaskModel, WorkflowModel } from '@conductor/common';
import type { ExecutionDAOFacade, QueueDAO } from '@conductor/core';

interface Stmt {
  run(...args: unknown[]): { changes: number };
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

interface RawDb {
  prepare(sql: string): Stmt;
}

export class SyncSqliteAdapter implements ExecutionDAOFacade, QueueDAO {
  private readonly stmtGetWorkflow: Stmt;
  private readonly stmtGetTasksForWorkflow: Stmt;
  private readonly stmtGetTask: Stmt;
  private readonly stmtInsertWorkflow: Stmt;
  private readonly stmtUpdateWorkflow: Stmt;
  private readonly stmtInsertWorkflowPending: Stmt;
  private readonly stmtDeleteWorkflowPending: Stmt;
  private readonly stmtInsertWorkflowDefToWorkflow: Stmt;
  private readonly stmtInsertTask: Stmt;
  private readonly stmtUpdateTask: Stmt;
  private readonly stmtDeleteTask: Stmt;
  private readonly stmtInsertWorkflowToTask: Stmt;
  private readonly stmtInsertTaskInProgress: Stmt;
  private readonly stmtDeleteTaskInProgress: Stmt;
  private readonly stmtInsertTaskScheduled: Stmt;
  private readonly stmtInsertTaskLog: Stmt;
  private readonly stmtDeleteWorkflow: Stmt;
  private readonly stmtRunningWorkflowIds: Stmt;
  private readonly stmtPendingWorkflows: Stmt;
  private readonly stmtWorkflowsByName: Stmt;
  private readonly stmtRemovePendingWorkflow: Stmt;
  private readonly stmtEnsureQueue: Stmt;
  private readonly stmtPushQueueMessage: Stmt;
  private readonly stmtRemoveQueueMessage: Stmt;
  private readonly stmtContainsMessage: Stmt;
  private readonly stmtResetOffsetTime: Stmt;
  private readonly stmtPostpone: Stmt;
  private readonly stmtPopMessage: Stmt;
  private readonly stmtMarkPopped: Stmt;

  constructor(db: RawDb) {
    this.stmtGetWorkflow = db.prepare(
      'SELECT json_data FROM workflow WHERE workflow_id = ?',
    );
    this.stmtGetTasksForWorkflow = db.prepare(
      'SELECT t.json_data FROM task t JOIN workflow_to_task wtt ON t.task_id = wtt.task_id WHERE wtt.workflow_id = ?',
    );
    this.stmtGetTask = db.prepare('SELECT json_data FROM task WHERE task_id = ?');
    this.stmtInsertWorkflow = db.prepare(
      'INSERT OR IGNORE INTO workflow (workflow_id, correlation_id, json_data) VALUES (?, ?, ?)',
    );
    this.stmtUpdateWorkflow = db.prepare(
      'UPDATE workflow SET json_data = ?, modified_on = CURRENT_TIMESTAMP WHERE workflow_id = ?',
    );
    this.stmtInsertWorkflowPending = db.prepare(
      'INSERT OR IGNORE INTO workflow_pending (workflow_type, workflow_id) VALUES (?, ?)',
    );
    this.stmtDeleteWorkflowPending = db.prepare(
      'DELETE FROM workflow_pending WHERE workflow_type = ? AND workflow_id = ?',
    );
    this.stmtInsertWorkflowDefToWorkflow = db.prepare(
      'INSERT OR IGNORE INTO workflow_def_to_workflow (workflow_def, date_str, workflow_id) VALUES (?, ?, ?)',
    );
    this.stmtInsertTask = db.prepare(
      'INSERT OR IGNORE INTO task (task_id, json_data) VALUES (?, ?)',
    );
    this.stmtUpdateTask = db.prepare(
      'UPDATE task SET json_data = ?, modified_on = CURRENT_TIMESTAMP WHERE task_id = ?',
    );
    this.stmtDeleteTask = db.prepare('DELETE FROM task WHERE task_id = ?');
    this.stmtInsertWorkflowToTask = db.prepare(
      'INSERT OR IGNORE INTO workflow_to_task (workflow_id, task_id) VALUES (?, ?)',
    );
    this.stmtInsertTaskInProgress = db.prepare(
      'INSERT OR IGNORE INTO task_in_progress (task_def_name, task_id, workflow_id, in_progress_status) VALUES (?, ?, ?, 0)',
    );
    this.stmtDeleteTaskInProgress = db.prepare(
      'DELETE FROM task_in_progress WHERE task_id = ?',
    );
    this.stmtInsertTaskScheduled = db.prepare(
      'INSERT OR IGNORE INTO task_scheduled (workflow_id, task_key, task_id) VALUES (?, ?, ?)',
    );
    this.stmtInsertTaskLog = db.prepare(
      'INSERT INTO task_log (task_id, json_data) VALUES (?, ?)',
    );
    this.stmtDeleteWorkflow = db.prepare(
      'DELETE FROM workflow WHERE workflow_id = ?',
    );
    this.stmtRunningWorkflowIds = db.prepare(
      'SELECT workflow_id FROM workflow_pending WHERE workflow_type = ?',
    );
    this.stmtPendingWorkflows = db.prepare(
      'SELECT w.json_data FROM workflow w JOIN workflow_pending wp ON w.workflow_id = wp.workflow_id WHERE wp.workflow_type = ?',
    );
    this.stmtWorkflowsByName = db.prepare(
      'SELECT w.json_data FROM workflow w JOIN workflow_def_to_workflow wd ON w.workflow_id = wd.workflow_id WHERE wd.workflow_def = ?',
    );
    this.stmtRemovePendingWorkflow = db.prepare(
      'DELETE FROM workflow_pending WHERE workflow_type = ? AND workflow_id = ?',
    );
    this.stmtEnsureQueue = db.prepare(
      'INSERT OR IGNORE INTO queue (queue_name) VALUES (?)',
    );
    this.stmtPushQueueMessage = db.prepare(
      `INSERT OR IGNORE INTO queue_message (queue_name, message_id, priority, popped, deliver_on)
       VALUES (?, ?, ?, 0, datetime('now', '+' || ? || ' seconds'))`,
    );
    this.stmtRemoveQueueMessage = db.prepare(
      'DELETE FROM queue_message WHERE queue_name = ? AND message_id = ?',
    );
    this.stmtContainsMessage = db.prepare(
      'SELECT 1 FROM queue_message WHERE queue_name = ? AND message_id = ? AND popped = 0',
    );
    this.stmtResetOffsetTime = db.prepare(
      'UPDATE queue_message SET deliver_on = CURRENT_TIMESTAMP WHERE queue_name = ? AND message_id = ?',
    );
    this.stmtPostpone = db.prepare(
      `UPDATE queue_message SET deliver_on = datetime('now', '+' || ? || ' seconds') WHERE queue_name = ? AND message_id = ?`,
    );
    this.stmtPopMessage = db.prepare(
      `SELECT message_id FROM queue_message
       WHERE queue_name = ? AND popped = 0 AND deliver_on <= CURRENT_TIMESTAMP
       ORDER BY priority DESC, created_on ASC LIMIT 1`,
    );
    this.stmtMarkPopped = db.prepare(
      'UPDATE queue_message SET popped = 1 WHERE queue_name = ? AND message_id = ?',
    );
  }

  private dateStr(timeInMs?: number): string {
    const d = timeInMs ? new Date(timeInMs) : new Date();
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  // ── ExecutionDAOFacade ──────────────────────────────────────────────────

  getWorkflowModel(workflowId: string, includeTasks: boolean): WorkflowModel | null {
    const row = this.stmtGetWorkflow.get(workflowId) as { json_data: string } | undefined;
    if (!row) return null;
    const wf: WorkflowModel = JSON.parse(row.json_data);
    if (includeTasks) {
      const taskRows = this.stmtGetTasksForWorkflow.all(workflowId) as Array<{
        json_data: string;
      }>;
      wf.tasks = taskRows.map((r) => JSON.parse(r.json_data) as TaskModel);
      wf.tasks.sort((a, b) => (a.seq || 0) - (b.seq || 0));
    }
    return wf;
  }

  getWorkflowModelFromExecutionDAO(workflowId: string, includeTasks: boolean): WorkflowModel {
    const wf = this.getWorkflowModel(workflowId, includeTasks);
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);
    return wf;
  }

  getTaskModel(taskId: string): TaskModel | null {
    const row = this.stmtGetTask.get(taskId) as { json_data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.json_data) as TaskModel;
  }

  createWorkflow(workflow: WorkflowModel): void {
    const tasks = workflow.tasks;
    workflow.tasks = [];
    try {
      this.stmtInsertWorkflow.run(
        workflow.workflowId,
        workflow.correlationId ?? null,
        JSON.stringify(workflow),
      );
      this.stmtInsertWorkflowDefToWorkflow.run(
        workflow.workflowName ?? workflow.workflowType,
        this.dateStr(workflow.createTime ?? undefined),
        workflow.workflowId,
      );
      if (!isWorkflowTerminal(workflow.status)) {
        this.stmtInsertWorkflowPending.run(
          workflow.workflowType ?? workflow.workflowName,
          workflow.workflowId,
        );
      }
    } finally {
      workflow.tasks = tasks;
    }
  }

  updateWorkflow(workflow: WorkflowModel): void {
    const tasks = workflow.tasks;
    workflow.tasks = [];
    try {
      this.stmtUpdateWorkflow.run(JSON.stringify(workflow), workflow.workflowId);
      if (isWorkflowTerminal(workflow.status)) {
        this.stmtDeleteWorkflowPending.run(
          workflow.workflowType ?? workflow.workflowName,
          workflow.workflowId,
        );
      } else {
        this.stmtInsertWorkflowPending.run(
          workflow.workflowType ?? workflow.workflowName,
          workflow.workflowId,
        );
      }
    } finally {
      workflow.tasks = tasks;
    }
  }

  createTasks(tasks: TaskModel[]): void {
    for (const task of tasks) {
      if (!task.taskId || !task.workflowInstanceId || !task.referenceTaskName) continue;
      const taskKey = `${task.referenceTaskName}_${task.retryCount ?? 0}`;
      const result = this.stmtInsertTaskScheduled.run(
        task.workflowInstanceId,
        taskKey,
        task.taskId,
      );
      if (result.changes === 0) continue; // already scheduled
      task.scheduledTime = task.scheduledTime ?? Date.now();
      this.stmtInsertTask.run(task.taskId, JSON.stringify(task));
      this.stmtInsertWorkflowToTask.run(task.workflowInstanceId, task.taskId);
      this.stmtInsertTaskInProgress.run(
        task.taskDefName || task.taskType,
        task.taskId,
        task.workflowInstanceId,
      );
    }
  }

  updateTask(task: TaskModel): void {
    this.stmtUpdateTask.run(JSON.stringify(task), task.taskId);
    if (task.status && isTaskTerminal(task.status)) {
      this.stmtDeleteTaskInProgress.run(task.taskId);
    }
  }

  updateTasks(tasks: TaskModel[]): void {
    for (const task of tasks) {
      this.updateTask(task);
    }
  }

  removeTask(taskId: string): void {
    this.stmtDeleteTaskInProgress.run(taskId);
    this.stmtDeleteTask.run(taskId);
  }

  removeWorkflow(workflowId: string, _removeFromIndex: boolean): void {
    const wf = this.getWorkflowModel(workflowId, false);
    if (wf) {
      this.stmtDeleteWorkflowPending.run(
        wf.workflowType ?? wf.workflowName,
        workflowId,
      );
    }
    this.stmtDeleteWorkflow.run(workflowId);
  }

  resetWorkflow(_workflowId: string): void {}

  populateTaskData(_task: TaskModel): void {}

  populateWorkflowAndTaskPayloadData(_workflow: WorkflowModel): void {}

  addTaskExecLog(logs: Array<{ log: string; taskId?: string; createdTime?: number }>): void {
    for (const l of logs) {
      if (l.taskId) {
        this.stmtInsertTaskLog.run(l.taskId, JSON.stringify(l));
      }
    }
  }

  extendLease(_task: TaskModel): void {}

  removeFromPendingWorkflow(workflowName: string, workflowId: string): void {
    this.stmtRemovePendingWorkflow.run(workflowName, workflowId);
  }

  getTaskPollDataByDomain(
    _taskType: string,
    _domain: string,
  ): { domain: string; lastPollTime: number } | null {
    return null;
  }

  getPendingWorkflowsByName(workflowName: string, _version: number): WorkflowModel[] {
    const rows = this.stmtPendingWorkflows.all(workflowName) as Array<{ json_data: string }>;
    return rows.map((r) => JSON.parse(r.json_data) as WorkflowModel);
  }

  getWorkflowsByName(name: string, _startTime: number, _endTime: number): WorkflowModel[] {
    const rows = this.stmtWorkflowsByName.all(name) as Array<{ json_data: string }>;
    return rows.map((r) => JSON.parse(r.json_data) as WorkflowModel);
  }

  getRunningWorkflowIds(workflowName: string, _version: number): string[] {
    const rows = this.stmtRunningWorkflowIds.all(workflowName) as Array<{
      workflow_id: string;
    }>;
    return rows.map((r) => r.workflow_id);
  }

  // ── QueueDAO ────────────────────────────────────────────────────────────

  push(queueName: string, id: string, priority: number, delaySeconds: number): void {
    this.stmtEnsureQueue.run(queueName);
    this.stmtPushQueueMessage.run(queueName, id, priority, String(delaySeconds));
  }

  pushDuration(queueName: string, id: string, priority: number, delay: { seconds: number }): void {
    this.push(queueName, id, priority, delay.seconds);
  }

  remove(queueName: string, id: string): void {
    this.stmtRemoveQueueMessage.run(queueName, id);
  }

  postpone(queueName: string, id: string, _priority: number, delaySeconds: number): void {
    this.stmtPostpone.run(String(delaySeconds), queueName, id);
  }

  setUnackTimeout(_queueName: string, _id: string, _timeoutMs: number): void {}

  containsMessage(queueName: string, id: string): boolean {
    return this.stmtContainsMessage.get(queueName, id) != null;
  }

  resetOffsetTime(queueName: string, id: string): boolean {
    return this.stmtResetOffsetTime.run(queueName, id).changes > 0;
  }

  // ── Sweep helper ────────────────────────────────────────────────────────

  popMessage(queueName: string): string | null {
    const row = this.stmtPopMessage.get(queueName) as { message_id: string } | undefined;
    if (!row) return null;
    this.stmtMarkPopped.run(queueName, row.message_id);
    return row.message_id;
  }
}
