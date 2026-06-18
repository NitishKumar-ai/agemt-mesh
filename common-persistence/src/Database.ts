import { Generated, ColumnType } from 'kysely';

export interface BaseEntity {
  id: Generated<number>;
  created_on: ColumnType<Date, string | Date | undefined, string | Date>;
  modified_on: ColumnType<Date, string | Date | undefined, string | Date>;
}

export interface MetaTaskDefTable extends BaseEntity {
  name: string;
  json_data: string;
}

export interface MetaWorkflowDefTable extends BaseEntity {
  name: string;
  version: number;
  latest_version: number;
  json_data: string;
}

export interface MetaEventHandlerTable extends BaseEntity {
  name: string;
  event: string;
  active: boolean;
  json_data: string;
}

export interface WorkflowTable extends BaseEntity {
  workflow_id: string;
  correlation_id: string | null;
  json_data: string;
}

export interface TaskTable extends BaseEntity {
  task_id: string;
  json_data: string;
}

export interface TaskLogTable {
  id: Generated<number>;
  created_on: ColumnType<Date, string | Date | undefined, string | Date>;
  task_id: string;
  json_data: string;
}

export interface QueueTable {
  id: Generated<number>;
  created_on: ColumnType<Date, string | Date | undefined, string | Date>;
  queue_name: string;
}

export interface QueueMessageTable {
  id: Generated<number>;
  created_on: ColumnType<Date, string | Date | undefined, string | Date>;
  deliver_on: ColumnType<Date, string | Date | undefined, string | Date>;
  queue_name: string;
  message_id: string;
  priority: number;
  popped: boolean;
  offset_time_seconds: string | null;
  payload: string | null;
}

export interface EventExecutionTable extends BaseEntity {
  event_handler_name: string;
  event_name: string;
  message_id: string;
  execution_id: string;
  json_data: string;
}

export interface PollDataTable extends BaseEntity {
  queue_name: string;
  domain: string;
  json_data: string;
}

export interface TaskInProgressTable extends BaseEntity {
  task_def_name: string;
  task_id: string;
  workflow_id: string;
  in_progress_status: boolean;
}

export interface TaskScheduledTable extends BaseEntity {
  workflow_id: string;
  task_key: string;
  task_id: string;
}

export interface WorkflowPendingTable extends BaseEntity {
  workflow_type: string;
  workflow_id: string;
}

export interface WorkflowDefToWorkflowTable extends BaseEntity {
  workflow_def: string;
  date_str: string | null;
  workflow_id: string;
}

export interface WorkflowToTaskTable extends BaseEntity {
  workflow_id: string;
  task_id: string;
}

export interface Database {
  meta_task_def: MetaTaskDefTable;
  meta_workflow_def: MetaWorkflowDefTable;
  meta_event_handler: MetaEventHandlerTable;
  workflow: WorkflowTable;
  task: TaskTable;
  task_log: TaskLogTable;
  queue: QueueTable;
  queue_message: QueueMessageTable;
  event_execution: EventExecutionTable;
  poll_data: PollDataTable;
  task_in_progress: TaskInProgressTable;
  task_scheduled: TaskScheduledTable;
  workflow_pending: WorkflowPendingTable;
  workflow_def_to_workflow: WorkflowDefToWorkflowTable;
  workflow_to_task: WorkflowToTaskTable;
}
