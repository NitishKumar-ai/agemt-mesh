export type PageKey =
  | 'home'
  | 'briefs'
  | 'knowledge'
  | 'sources'
  | 'automation'
  | 'audit'
  | 'session'
  | 'sessions'
  | 'workflows'
  | 'approvals'
  | 'agents'
  | 'safety'
  | 'commitguard'
  | 'marketing'
  | 'tasks'
  | 'schedules'
  | 'activity'
  | 'connections'
  | 'chat'
  | 'ask'
  | 'admin'
  | 'settings';

export type MeshEvent = Record<string, any>;
export type GitHubStatus = Record<string, any>;
export type KillswitchState = Record<string, any>;
export type AgentSession = Record<string, any>;
export type AgentStep = Record<string, any>;
export type ApprovalEvent = Record<string, any>;
export type AppSettings = Record<string, any>;
export type ConnectionInfo = Record<string, any>;
export type ConnectorConfig = Record<string, any>;
export type SocialPlatform = string;
export type MarketingAuditEvent = Record<string, any>;
export type MarketingCampaign = Record<string, any>;
export type SecurityFinding = Record<string, any>;
export type SafetyEscalation = Record<string, any>;
export type SafetyStats = Record<string, any>;
export type SafetyVerdict = Record<string, any>;
export type ScheduledTask = Record<string, any>;
export type SessionMessage = Record<string, any>;
export type SuggestedTask = Record<string, any>;
export type WorkflowRun = Record<string, any>;
export type GitHubRepository = Record<string, any>;

export interface Citation {
  id: string;
  source_id: string;
  title: string;
  url: string | null;
  exact_text?: string;
  confidence: number;
}

export interface AskAnswer {
  answer: string;
  confidence: number;
  level: 'high' | 'medium' | 'low' | 'abstain';
  citations: Citation[];
}
