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


export interface AgentSessionTable {
  run_id: string;
  agent_id: string;
  started_at: number;
  updated_at: number;
  last_step: string;
  status: string;
  step_count: number;
}

export interface AgentStepTable {
  id: Generated<number>;
  run_id: string;
  agent_id: string;
  step: string;
  status: string;
  created_at: number;
}

export interface DlqEventTable {
  id: Generated<number>;
  run_id: string;
  agent_id: string;
  error: string;
  created_at: number;
}

export interface ApprovalTable {
  id: Generated<number>;
  run_id: string;
  payload: string;
  status: string;
  risk_level: string;
  requesting_agent: string;
  created_at: number;
}

export interface ApprovalHistoryTable {
  id: Generated<number>;
  approval_id: number;
  action: string;
  actor: string;
  payload: string;
  created_at: number;
}

export interface SafetyVerdictTable {
  id: Generated<number>;
  run_id: string;
  agent_id: string;
  frame_hash: string;
  verdict: string;
  confidence: number;
  reasoning: string;
  checks: string;
  risk_tier: string;
  recursion_depth: number;
  counterfactual_flag: number;
  critic_model: string;
  eval_duration_ms: number;
  created_at: number;
}

export interface SafetyEscalationTable {
  id: Generated<number>;
  run_id: string;
  agent_id: string;
  frame_hash: string;
  verdict_id: number | null;
  escalation_type: string;
  resolved: number;
  resolved_by: string | null;
  resolution: string | null;
  created_at: number;
  resolved_at: number | null;
}

export interface MarketingCampaignTable {
  id: Generated<number>;
  source_finding_id: number | null;
  name: string;
  audience: string;
  finding_summary: string;
  value_proposition: string | null;
  channel: string;
  status: string;
  subject: string | null;
  body: string | null;
  approval_note: string | null;
  created_at: number;
  updated_at: number;
}

export interface MarketingAuditEventTable {
  id: Generated<number>;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string;
  payload: string;
  created_at: number;
}

export interface SecurityFindingTable {
  id: Generated<number>;
  source_agent: string;
  title: string;
  summary: string;
  evidence: string;
  severity: string;
  repository: string | null;
  status: string;
  verified_by: string | null;
  verified_at: number | null;
  created_at: number;
}

export interface DashboardScheduleTable {
  id: Generated<number>;
  name: string;
  prompt: string;
  interval: string;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  created_at: number;
  updated_at: number;
}

export interface ConnectionTable {
  id: string;
  provider_id: string;
  connector_type: string;
  status: string;
  config: string;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface KillswitchMetaTable {
  key: string;
  engaged_by: string | null;
  updated_at: number;
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
  agent_sessions: AgentSessionTable;
  agent_steps: AgentStepTable;
  dlq_events: DlqEventTable;
  approvals: ApprovalTable;
  approval_history: ApprovalHistoryTable;
  safety_verdicts: SafetyVerdictTable;
  safety_escalations: SafetyEscalationTable;
  marketing_campaigns: MarketingCampaignTable;
  marketing_audit_events: MarketingAuditEventTable;
  security_findings: SecurityFindingTable;
  dashboard_schedules: DashboardScheduleTable;
  connections: ConnectionTable;
  killswitch_meta: KillswitchMetaTable;
  user_access_grants: UserAccessGrantTable;
  principals: PrincipalTable;
  tenant_memberships: TenantMembershipTable;
  principal_roles: PrincipalRoleTable;
  groups: GroupTable;
  group_memberships: GroupMembershipTable;
  group_access_grants: GroupAccessGrantTable;
}

export interface UserAccessGrantTable {
  id: Generated<number>;
  tenant_id: string;
  user_id: string;
  permission_hash: string;
  is_admin: Generated<number>;
  created_at: number;
}

export interface PrincipalTable {
  id: string;
  tenant_id: string;
  principal_type: string;
  external_subject: string | null;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: number | bigint;
}

export interface TenantMembershipTable {
  id: Generated<number>;
  tenant_id: string;
  principal_id: string;
  status: string;
  created_at: number | bigint;
}

export interface PrincipalRoleTable {
  id: Generated<number>;
  tenant_id: string;
  principal_id: string;
  role: string;
  created_at: number | bigint;
}

export interface GroupTable {
  id: string;
  tenant_id: string;
  name: string;
  created_at: number | bigint;
}

export interface GroupMembershipTable {
  id: Generated<number>;
  tenant_id: string;
  group_id: string;
  principal_id: string;
  created_at: number | bigint;
}

export interface GroupAccessGrantTable {
  id: Generated<number>;
  tenant_id: string;
  group_id: string;
  permission_hash: string;
  created_at: number | bigint;
}
