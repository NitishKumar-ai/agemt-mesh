import type { AgentInfo, AgentSession, AgentStep, AppSettings, ApprovalEvent, DlqEvent, GitHubRepository, GitHubStatus, KillswitchState, MarketingAuditEvent, MarketingCampaign, SafetyEscalation, SafetyStats, SafetyTraceFrame, SafetyVerdict, ScheduledTask, SecurityFinding, SocialPlatform, SuggestedTask, WorkflowRun } from "./types";

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      throw new Error(body.detail || body.message || text || `Request failed with ${response.status}`);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(text || `Request failed with ${response.status}`);
      throw e;
    }
  }
  return response.json() as Promise<T>;
}

export const api = {
  githubStatus() {
    return json<GitHubStatus>("/api/github/status");
  },

  connectGitHub() {
    window.location.assign("/api/github/connect");
  },

  disconnectGitHub() {
    return json<{ status: string }>("/api/github/connection", { method: "DELETE" });
  },

  listGitHubRepositories() {
    return json<{ repositories: GitHubRepository[] }>("/api/github/repositories");
  },

  listImportedRepositories() {
    return json<{ repositories: GitHubRepository[] }>("/api/github/imported-repositories");
  },

  importGitHubRepository(repositoryId: number) {
    return json<{ status: string; repository: GitHubRepository }>("/api/github/imported-repositories", {
      method: "POST",
      body: JSON.stringify({ repository_id: repositoryId })
    });
  },

  listMarketingCampaigns() {
    return json<{ campaigns: MarketingCampaign[] }>("/api/marketing/campaigns");
  },

  listSecurityFindings() {
    return json<{ findings: SecurityFinding[] }>("/api/security/findings");
  },

  listMarketingAuditEvents() {
    return json<{ events: MarketingAuditEvent[] }>("/api/marketing/audit-events");
  },

  verifySecurityFinding(findingId: number) {
    return json<{ status: string }>(`/api/security/findings/${findingId}/verify`, {
      method: "POST",
      body: JSON.stringify({ verified_by: "Marketing workspace operator" })
    });
  },

  createMarketingCampaign(payload: {
    name: string;
    audience: string;
    finding_summary: string;
    value_proposition: string;
    channel: string;
    source_finding_id?: number;
  }) {
    return json<{ status: string; campaign_id: number }>("/api/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  generateMarketingCampaign(campaignId: number) {
    // Now starts the full Research → Write pipeline; returns workflow_id for SSE tracking
    return json<{ status: string; workflow_id: string }>(`/api/marketing/campaigns/${campaignId}/generate`, {
      method: "POST"
    });
  },

  approveMarketingCampaign(campaignId: number, note = "") {
    return json<{ status: string }>(`/api/marketing/campaigns/${campaignId}/approve`, {
      method: "POST",
      body: JSON.stringify({ note })
    });
  },

  scheduleMarketingCampaign(campaignId: number) {
    return json<{ status: string; method: string; typefully_id: string | null }>(
      `/api/marketing/campaigns/${campaignId}/schedule`,
      { method: "POST" }
    );
  },

  runWorkflow(context: string) {
    return json<{ status: string; workflow_id: string }>("/api/run", {
      method: "POST",
      body: JSON.stringify({ context })
    });
  },

  approveWorkflow(workflowId: string, approved: boolean) {
    return json<{ status: string }>(`/api/approve/${workflowId}`, {
      method: "POST",
      body: JSON.stringify({ approved })
    });
  },

  listTasks() {
    return json<{ tasks: SuggestedTask[] }>("/api/tasks");
  },

  scanTasks() {
    return json<{ status: string; workflow_id: string }>("/api/tasks/scan", { method: "POST" });
  },

  runTask(taskId: number) {
    return json<{ status: string; workflow_id: string }>(`/api/tasks/${taskId}/run`, { method: "POST" });
  },

  listSchedules() {
    return json<{ schedules: ScheduledTask[] }>("/api/schedule");
  },

  createSchedule(payload: { name: string; prompt: string; interval: string }) {
    return json<{ status: string; task_id: number }>("/api/schedule", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  deleteSchedule(taskId: number) {
    return json<{ status: string }>(`/api/schedule/${taskId}`, { method: "DELETE" });
  },

  runCommitGuardScan(repoUrl: string, maxFindings: number) {
    return json<{ job_id: string; status: string; eta: string }>("/api/commitguard/scan", {
      method: "POST",
      body: JSON.stringify({ repo_url: repoUrl, max_findings: maxFindings })
    });
  },

  getCommitGuardStatus(jobId: string) {
    return json<{ job_id: string; status: string; step: string; progress_pct: number }>
      (`/api/commitguard/status/${jobId}`);
  },

  getCommitGuardFindings(jobId: string) {
    return json<{ findings: unknown[]; findings_truncated: boolean }>
      (`/api/commitguard/findings/${jobId}`);
  },

  // Sessions
  listSessions() {
    return json<{ sessions: AgentSession[] }>("/api/sessions");
  },

  getSession(runId: string) {
    return json<{ steps: AgentStep[] }>(`/api/sessions/${runId}`);
  },

  // Workflows
  listWorkflows() {
    return json<{ workflows: WorkflowRun[]; dlq: DlqEvent[] }>("/api/workflows");
  },

  retryWorkflow(runId: string) {
    return json<{ status: string; new_workflow_id: string }>(`/api/workflows/${runId}/retry`, { method: "POST" });
  },

  // Approvals
  listApprovals() {
    return json<{ approvals: ApprovalEvent[] }>("/api/approvals");
  },

  // Schedules — Phase 2
  updateSchedule(taskId: number, payload: { name?: string; prompt?: string; interval?: string; enabled?: boolean }) {
    return json<{ status: string }>(`/api/schedule/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },

  runScheduleNow(taskId: number) {
    return json<{ status: string; workflow_id: string }>(`/api/schedule/${taskId}/run`, { method: "POST" });
  },

  // Killswitch
  getKillswitchState() {
    return json<KillswitchState>("/api/killswitch");
  },

  engageKillswitch(reason?: string) {
    return json<{ status: string; killswitch_active: boolean; state: KillswitchState }>("/api/killswitch", {
      method: "POST",
      body: JSON.stringify({ engaged: true, reason, engaged_by: "operator" })
    });
  },

  disengageKillswitch() {
    return json<{ status: string; killswitch_active: boolean; state: KillswitchState }>("/api/killswitch", { method: "DELETE" });
  },

  // Agents
  listAgents() {
    return json<{ agents: AgentInfo[] }>("/api/agents");
  },

  // Social connections
  listSocialPlatforms() {
    return json<{ platforms: SocialPlatform[] }>("/api/social/platforms");
  },

  connectSocial(platform: string, apiKey: string, username?: string) {
    return json<{ status: string; platform: string; username: string | null }>("/api/social/connect", {
      method: "POST",
      body: JSON.stringify({ platform, api_key: apiKey, username }),
    });
  },

  disconnectSocial(platform: string) {
    return json<{ status: string; platform: string }>(`/api/social/${platform}`, {
      method: "DELETE",
    });
  },

  runAgent(agentId: string, goal: string, context: string, config?: Record<string, unknown>) {
    return json<{ status: string; workflow_id: string; agent_id: string }>("/api/agents/run", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, goal, context, config }),
    });
  },

  // Safety / CriticGate
  safetyStats() {
    return json<SafetyStats>("/api/safety/stats");
  },

  safetyVerdicts(runId?: string) {
    const q = runId ? `?run_id=${runId}` : "";
    return json<{ verdicts: SafetyVerdict[] }>(`/api/safety/verdicts${q}`);
  },

  safetyTraces(runId: string) {
    return json<{ traces: SafetyTraceFrame[] }>(`/api/safety/traces/${runId}`);
  },

  safetyEscalations(resolved?: boolean) {
    const q = resolved !== undefined ? `?resolved=${resolved}` : "";
    return json<{ escalations: SafetyEscalation[] }>(`/api/safety/escalations${q}`);
  },

  resolveEscalation(escalationId: number, resolution: string) {
    return json<{ status: string }>(`/api/safety/escalations/${escalationId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution, resolved_by: "operator" }),
    });
  },

  // Settings
  getSettings() {
    return json<AppSettings>("/api/settings");
  }
};
