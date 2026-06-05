export type PageKey =
  | "session"
  | "sessions"
  | "workflows"
  | "approvals"
  | "commitguard"
  | "marketing"
  | "tasks"
  | "schedules"
  | "activity"
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
