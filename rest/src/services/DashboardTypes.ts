export interface AgentSession {
  run_id: string;
  agent_id: string;
  started_at: string;
  updated_at: string;
  last_step: string;
  status: string;
  step_count: number;
}

export interface AgentStep {
  id: number;
  run_id: string;
  agent_id: string;
  step: string;
  status: string;
  created_at: string;
}

export interface WorkflowRun {
  run_id: string;
  agent_id: string;
  started_at: string;
  updated_at: string;
  last_step: string;
  status: string;
  step_count: number;
}

export interface DlqEvent {
  id: number;
  run_id: string;
  agent_id: string;
  error: string;
  created_at: string;
}

export interface ApprovalHistoryEntry {
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ApprovalEvent {
  id: number;
  run_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  requesting_agent: string;
  history?: ApprovalHistoryEntry[];
}

export interface SafetyVerdict {
  id: number;
  run_id: string;
  agent_id: string;
  frame_hash: string;
  verdict: 'PASS' | 'FLAG' | 'BLOCK';
  confidence: number;
  reasoning: string;
  checks: Record<string, boolean>;
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  recursion_depth: number;
  counterfactual_flag: boolean;
  critic_model: string;
  eval_duration_ms: number;
  created_at: string;
}

export interface SafetyEscalation {
  id: number;
  run_id: string;
  agent_id: string;
  frame_hash: string;
  verdict_id: number | null;
  escalation_type: string;
  resolved: boolean;
  resolved_by: string | null;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SafetyStats {
  total_evaluations: number;
  by_verdict: Record<string, number>;
  by_risk_tier: Record<string, number>;
  avg_confidence: number;
  avg_eval_duration_ms: number;
  counterfactual_blocks: number;
  open_escalations: number;
}

export interface MarketingCampaign {
  id: number;
  source_finding_id?: number;
  name: string;
  audience: string;
  finding_summary: string;
  value_proposition?: string;
  channel: 'email' | 'linkedin' | 'report';
  status: 'draft' | 'review_required' | 'approved';
  subject?: string;
  body?: string;
  approval_note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MarketingAuditEvent {
  id: number;
  entity_type: 'finding' | 'campaign';
  entity_id: number;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SecurityFinding {
  id: number;
  source_agent: string;
  title: string;
  summary: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository?: string;
  status: 'review_required' | 'verified';
  verified_by?: string;
  verified_at?: string;
  created_at?: string;
}

export interface ScheduledTask {
  id: number;
  name: string;
  prompt: string;
  interval: string;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  enabled?: number;
}

export interface AppSettings {
  model_plan: string;
  model_execute: string;
  e2b_configured: boolean;
  github_configured: boolean;
  traceloop_configured: boolean;
  langfuse_configured: boolean;
  commitguard_webhook: string;
  killswitch_active: boolean;
}

export interface KillswitchState {
  engaged: boolean;
  engaged_at: string | null;
  engaged_by: string | null;
  reason: string | null;
  updated_at?: string;
}

export interface ConfigField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
}

export interface ConnectorConfig {
  provider_id: string;
  connector_type: 'direct' | 'mcp' | 'oauth';
  name: string;
  description: string;
  icon?: string;
  category: string;
  auth_type: string;
  config_schema: ConfigField[];
}

export interface ConnectionInfo {
  id: string;
  provider_id: string;
  connector_type: string;
  status: 'connected' | 'error' | 'disconnected';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GitHubAccount {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  scopes?: string;
  connected_at?: string;
}

export interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  callback_url: string;
  account: GitHubAccount | null;
  imported_count: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  html_url: string;
  default_branch?: string;
  updated_at?: string;
  language?: string;
  imported_at?: string;
}
