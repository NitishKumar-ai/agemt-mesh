export type PageKey =
  | "session"
  | "sessions"
  | "workflows"
  | "approvals"
  | "agents"
  | "commitguard"
  | "marketing"
  | "tasks"
  | "schedules"
  | "activity"
  | "connections"
  | "safety"
  | "settings";

export type MeshEvent = {
  id: string;
  time: Date;
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type SuggestedTask = {
  id: number;
  file_path: string;
  line_number: number;
  marker: string;
  comment: string;
  rationale?: string;
  confidence?: number;
  status?: string;
};

export type ScheduledTask = {
  id: number;
  name: string;
  prompt: string;
  interval: string;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  enabled?: number;
};

export type GitHubAccount = {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  scopes?: string;
  connected_at?: string;
};

export type GitHubStatus = {
  configured: boolean;
  connected: boolean;
  callback_url: string;
  account: GitHubAccount | null;
  imported_count: number;
};

export type GitHubRepository = {
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
};

export type MarketingCampaign = {
  id: number;
  source_finding_id?: number;
  name: string;
  audience: string;
  finding_summary: string;
  value_proposition?: string;
  channel: "email" | "linkedin" | "report";
  status: "draft" | "review_required" | "approved";
  subject?: string;
  body?: string;
  approval_note?: string;
  created_at?: string;
  updated_at?: string;
};

export type SecurityFinding = {
  id: number;
  source_agent: string;
  title: string;
  summary: string;
  evidence: string;
  severity: "low" | "medium" | "high" | "critical";
  repository?: string;
  status: "review_required" | "verified";
  verified_by?: string;
  verified_at?: string;
  created_at?: string;
};

export type MarketingAuditEvent = {
  id: number;
  entity_type: "finding" | "campaign";
  entity_id: number;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type SessionMessage = {
  id: string;
  role: "user" | "agent" | "system" | "tool" | "approval";
  title?: string;
  body: string;
  time: Date;
  status?: "idle" | "planning" | "executing" | "blocked" | "success" | "failed";
  event?: MeshEvent;
};

export type AgentSession = {
  run_id: string;
  agent_id: string;
  started_at: string;
  updated_at: string;
  last_step: string;
  status: string;
  step_count: number;
};

export type AgentStep = {
  id: number;
  run_id: string;
  agent_id: string;
  step: string;
  status: string;
  created_at: string;
};

export type WorkflowRun = {
  run_id: string;
  agent_id: string;
  started_at: string;
  updated_at: string;
  last_step: string;
  status: string;
  step_count: number;
};

export type DlqEvent = {
  id: number;
  run_id: string;
  agent_id: string;
  error: string;
  created_at: string;
};

export type ApprovalEvent = {
  id: number;
  run_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type AppSettings = {
  model_plan: string;
  model_execute: string;
  e2b_configured: boolean;
  github_configured: boolean;
  traceloop_configured: boolean;
  langfuse_configured: boolean;
  commitguard_webhook: string;
  killswitch_active: boolean;
};

export type SocialPlatform = {
  id: string;
  name: string;
  description: string;
  auth_type: string;
  docs_url: string;
  icon: string;
  scopes: string;
  connected: boolean;
  username: string | null;
  connected_at: string | null;
};

export type AgentInfo = {
  id: string;
  name: string;
  description: string;
  model: string;
  sandbox: string | null;
  capabilities: string[];
  status: "idle" | "running" | "error";
};

export type SafetyVerdict = {
  id: number;
  run_id: string;
  agent_id: string;
  frame_hash: string;
  verdict: "PASS" | "FLAG" | "BLOCK";
  confidence: number;
  reasoning: string;
  checks: Record<string, boolean>;
  risk_tier: "low" | "medium" | "high" | "critical";
  recursion_depth: number;
  counterfactual_flag: boolean;
  critic_model: string;
  eval_duration_ms: number;
  created_at: string;
};

export type SafetyTraceFrame = {
  id: number;
  run_id: string;
  agent_id: string;
  step_index: number;
  thought: string;
  proposed_action: string;
  justification: string;
  dependencies: number[];
  context_hash: string;
  frame_hash: string;
  created_at: string;
};

export type SafetyEscalation = {
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
};

export type SafetyStats = {
  total_evaluations: number;
  by_verdict: Record<string, number>;
  by_risk_tier: Record<string, number>;
  avg_confidence: number;
  avg_eval_duration_ms: number;
  counterfactual_blocks: number;
  open_escalations: number;
};
