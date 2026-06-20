import type { AgentInfo, AgentSession, AgentStep, AppSettings, ApprovalEvent, ConnectionInfo, ConnectorConfig, DlqEvent, GitHubRepository, GitHubStatus, KillswitchState, MarketingAuditEvent, MarketingCampaign, SafetyEscalation, SafetyStats, SafetyTraceFrame, SafetyVerdict, ScheduledTask, SecurityFinding, SocialPlatform, SuggestedTask, WorkflowRun } from "./types";

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

  commitFindingToCampaign(findingId: number, goLive = false) {
    // Launches the autonomous commit-to-campaign workflow. Returns the workflow_id
    // (== run_id) used to filter the War Room /stream and to approve via /api/approvals.
    return json<{ status: string; workflow_id: string; finding_id: number; go_live: boolean }>(
      `/api/marketing/findings/${findingId}/commit-to-campaign`,
      { method: "POST", body: JSON.stringify({ go_live: goLive }) }
    );
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

// Unified connections
listAvailableConnectors() {
  return json<{ connectors: ConnectorConfig[] }>("/api/connections/available");
},

listConnections() {
  return json<{ connections: ConnectionInfo[] }>("/api/connections");
},

createConnection(providerId: string, config: any, metadata: any) {
  return json<{ status: string; id: string }>("/api/connections", {
    method: "POST",
    body: JSON.stringify({ provider_id: providerId, config, metadata })
  });
},

deleteConnection(connectionId: string) {
  return json<{ status: string }>(`/api/connections/${connectionId}`, {
    method: "DELETE"
  });
},

testConnection(connectionId: string) {
  return json<{ status: string }>(`/api/connections/${connectionId}/test`, {
    method: "POST"
  });
},

// Social connections

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

  // Session CRUD (title stored in localStorage until backend supports it)
  getSessionTitle(runId: string): string {
    try {
      const titles = JSON.parse(localStorage.getItem("mesh_session_titles") || "{}");
      return titles[runId] || "";
    } catch { return ""; }
  },

  setSessionTitle(runId: string, title: string) {
    try {
      const titles = JSON.parse(localStorage.getItem("mesh_session_titles") || "{}");
      titles[runId] = title;
      localStorage.setItem("mesh_session_titles", JSON.stringify(titles));
    } catch { /* noop */ }
  },

  deleteSessionTitle(runId: string) {
    try {
      const titles = JSON.parse(localStorage.getItem("mesh_session_titles") || "{}");
      delete titles[runId];
      localStorage.setItem("mesh_session_titles", JSON.stringify(titles));
    } catch { /* noop */ }
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

  decideApproval(approvalId: number, payload: { run_id: string; approved: boolean; note?: string }) {
    return json<{ status: string; action: string }>(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getApprovalHistory(approvalId: number) {
    return json<{ history: ApprovalEvent["history"] }>(`/api/approvals/${approvalId}/history`);
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
  },

  // ── Social Studio ─────────────────────────────────────────────────────────────

  ssListAccounts() {
    return json<{ accounts: import("./types").SSAccount[] }>("/api/social-studio/accounts");
  },
  ssGetAccount(id: number) {
    return json<{ account: import("./types").SSAccount, timeseries: import("./types").SSMetricSnapshot[] }>(`/api/social-studio/accounts/${id}`);
  },
  ssConnectAccount(payload: any) {
    return json<{ id: number; status: string }>("/api/social-studio/accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  ssDisconnectAccount(id: number) {
    return json<{ status: string }>(`/api/social-studio/accounts/${id}`, { method: "DELETE" });
  },
  ssHealthCheck(id: number) {
    return json<{ status: string; follower_count?: number; message?: string }>(`/api/social-studio/accounts/${id}/health-check`, { method: "POST" });
  },
  ssGenerate(payload: { topic: string; tone?: string; brand_voice?: string; platforms?: string[]; account_map?: Record<string, number> }) {
    return json<{ run_id: string; post_ids: number[]; platforms: string[]; status: string }>("/api/social-studio/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  ssGetRun(runId: string) {
    return json<{ run_id: string; posts: import("./types").SSPlatformPost[] }>(`/api/social-studio/generate/${runId}`);
  },
  ssListPosts(platform?: string, status?: string, limit: number = 50) {
    const params = new URLSearchParams();
    if (platform) params.append("platform", platform);
    if (status) params.append("status", status);
    params.append("limit", limit.toString());
    return json<{ posts: import("./types").SSPlatformPost[] }>(`/api/social-studio/posts?${params.toString()}`);
  },
  ssGetPost(id: number) {
    return json<{ post: import("./types").SSPlatformPost, publish_log: import("./types").SSPublishLog[] }>(`/api/social-studio/posts/${id}`);
  },
  ssPatchPost(id: number, caption: string) {
    return json<{ status: string }>(`/api/social-studio/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ caption })
    });
  },
  ssPublishPost(id: number) {
    return json<{ success: boolean; platform_post_id?: string; url?: string; error?: string | null }>(
      `/api/social-studio/posts/${id}/publish`,
      { method: "POST" },
    );
  },
  ssSchedulePost(id: number, scheduled_at: string) {
    return json<{ status: string; scheduled_at: string }>(`/api/social-studio/posts/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at })
    });
  },
  ssAutopost(payload: {
    topic: string;
    tone?: string;
    brand_voice?: string;
    platforms?: string[];
    account_map?: Record<string, number>;
    publish_now?: boolean;
  }) {
    return json<{
      run_id: string;
      topic: string;
      platforms: string[];
      results: Array<{
        platform: string;
        success: boolean;
        post_id?: number;
        url?: string;
        error?: string;
        caption_preview?: string;
        content?: string;
        step?: string;
        external_post_id?: string;
        published_at?: string;
      }>;
    }>("/api/social-studio/autopost", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  ssAutopostSchedule(payload: { topic: string; interval?: string; name?: string }) {
    return json<{ status: string; task_id: number; interval: string; topic: string }>(
      "/api/social-studio/autopost/schedule",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  ssImagenGenerate(payload: { prompt: string }) {
    return json<{ status: string; file_id: string; file_path: string; width: number; height: number; message: string }>(
      "/api/social-studio/imagen/generate",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  ssAnalyticsSummary() {
    return json<{ accounts: any[], totals: any, top_posts: any[] }>("/api/social-studio/analytics/summary");
  },
  ssAnalyticsTimeseries(accountId: number, metrics: string = "followers,impressions,reach,engagements", days: number = 30) {
    return json<{ account_id: number; metrics: string[]; data: import("./types").SSMetricSnapshot[] }>(`/api/social-studio/analytics/timeseries?account_id=${accountId}&metrics=${metrics}&days=${days}`);
  },
  ssAnalyticsPosts(limit: number = 20) {
    return json<{ posts: any[] }>(`/api/social-studio/analytics/posts?limit=${limit}`);
  },
  ssAnalyticsSync() {
    return json<{ synced: number; failed: number; details: any[] }>("/api/social-studio/analytics/sync", { method: "POST" });
  },
  ssCalendar(year: number = 0, month: number = 0) {
    return json<{ year: number; month: number; posts: any[] }>(`/api/social-studio/calendar?year=${year}&month=${month}`);
  },
  ssPlatforms() {
    return json<{ platforms: Record<string, import("./types").SSPlatformMeta> }>("/api/social-studio/platforms");
  },
  ssLinkedInCompanyPages() {
    return json<{ pages: Array<{ id: string; name: string; handle: string; access_token: string; picture?: string }> }>("/api/social-studio/oauth/linkedin_company/pages");
  },
  ssConnectLinkedInCompany(payload: { org_id: string; name: string; handle?: string; picture?: string; access_token: string }) {
    return json<{ status: string; org_id: string }>("/api/social-studio/oauth/linkedin_company/connect", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  
  // Ideas / Auto-Pilot
  ssCreateIdea(payload: { prompt: string; status?: string }) {
    return json<{ id: number }>("/api/social-studio/ideas", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  ssListIdeas() {
    return json<{ ideas: any[] }>("/api/social-studio/ideas");
  },
  ssUpdateIdeaStatus(id: number, status: string) {
    return json<{ success: boolean }>(`/api/social-studio/ideas/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }
};

