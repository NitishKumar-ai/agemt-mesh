import type { GitHubRepository, GitHubStatus, MarketingAuditEvent, MarketingCampaign, ScheduledTask, SecurityFinding, SuggestedTask } from "./types";

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
    return json<{ status: string; subject: string; body: string }>(`/api/marketing/campaigns/${campaignId}/generate`, {
      method: "POST"
    });
  },

  approveMarketingCampaign(campaignId: number, note = "") {
    return json<{ status: string }>(`/api/marketing/campaigns/${campaignId}/approve`, {
      method: "POST",
      body: JSON.stringify({ note })
    });
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
  }
};
