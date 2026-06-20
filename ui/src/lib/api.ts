import type {
  AgentSession,
  AppSettings,
  ApprovalEvent,
  ConnectionInfo,
  ConnectorConfig,
  GitHubStatus,
  KillswitchState,
  MarketingAuditEvent,
  MarketingCampaign,
  SafetyEscalation,
  SafetyStats,
  SafetyVerdict,
  ScheduledTask,
  SecurityFinding,
  SuggestedTask,
  WorkflowRun,
  GitHubRepository,
} from './types';

type Query = Record<string, string | number | boolean | undefined>;

function queryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function request<T>(
  path: string,
  options?: RequestInit & { query?: Query },
): Promise<T> {
  const response = await fetch(`${path}${queryString(options?.query)}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Agent Mesh API request failed with status ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function del<T>(path: string): Promise<T> {
  return request(path, { method: 'DELETE' });
}

export const api = {
  githubStatus: () => request<GitHubStatus>('/api/agents/github/status'),
  connectGitHub: (input?: unknown) => post<GitHubStatus>('/api/agents/github/connect', input),
  listGitHubRepositories: () =>
    request<any>('/api/agents/github/repositories').then((res) => ({
      repositories: (Array.isArray(res) ? res : res?.repositories || []) as any[],
    })),
  listImportedRepositories: () =>
    request<any>('/api/agents/github/imported').then((res) => ({
      repositories: (Array.isArray(res) ? res : res?.repositories || []) as any[],
    })),
  importGitHubRepository: (input: unknown) => post<any>('/api/agents/github/import', input),

  getKillswitchState: () => request<KillswitchState>('/api/agents/killswitch'),
  engageKillswitch: (input?: unknown) => post<KillswitchState>('/api/agents/killswitch/engage', input),
  disengageKillswitch: (input?: unknown) =>
    post<KillswitchState>('/api/agents/killswitch/disengage', input),

  listSessions: () =>
    request<any>('/api/agents/sessions').then((res) => ({
      sessions: (Array.isArray(res) ? res : res?.sessions || []) as AgentSession[],
    })),
  getSession: (runId: string) =>
    request<AgentSession>(`/api/agents/sessions/${encodeURIComponent(runId)}`),
  getSessionTitle: (runId: string) =>
    request<{ title?: string }>(`/api/agents/sessions/${encodeURIComponent(runId)}/title`),
  setSessionTitle: (runId: string, title: string) =>
    put<void>(`/api/agents/sessions/${encodeURIComponent(runId)}/title`, { title }),
  deleteSessionTitle: (runId: string) =>
    del<void>(`/api/agents/sessions/${encodeURIComponent(runId)}/title`),

  listWorkflows: () =>
    request<any>('/api/workflow/search').then((res) => ({
      workflows: (res?.results || res?.workflows || (Array.isArray(res) ? res : [])) as WorkflowRun[],
    })),
  runWorkflow: (input: unknown) => post<any>('/api/workflow', input),
  approveWorkflow: (workflowId: string, input?: unknown) =>
    post<any>(`/api/agents/workflows/${encodeURIComponent(workflowId)}/approve`, input),

  listTasks: () =>
    request<any>('/api/agents/tasks').then((res) => ({
      tasks: (Array.isArray(res) ? res : res?.tasks || []) as SuggestedTask[],
    })),
  scanTasks: (input?: unknown) => post<SuggestedTask[]>('/api/agents/tasks/scan', input),
  runTask: (input: unknown) => post<any>('/api/agents/tasks/run', input),

  listApprovals: () =>
    request<any>('/api/agents/approvals').then((res) => ({
      approvals: (Array.isArray(res) ? res : res?.approvals || []) as ApprovalEvent[],
    })),
  decideApproval: (approvalId: string, input: unknown) =>
    post<any>(`/api/agents/approvals/${encodeURIComponent(approvalId)}/decision`, input),
  getApprovalHistory: (approvalId: number) =>
    request<any>(`/api/agents/approvals/${encodeURIComponent(approvalId)}/history`).then((res) => ({
      history: (Array.isArray(res) ? res : res?.history || []) as any[],
    })),

  listSchedules: () =>
    request<any>('/api/agents/schedules').then((res) => ({
      schedules: (Array.isArray(res) ? res : res?.schedules || []) as ScheduledTask[],
    })),
  createSchedule: (input: unknown) => post<ScheduledTask>('/api/agents/schedules', input),
  updateSchedule: (id: string | number, input: unknown) =>
    put<ScheduledTask>(`/api/agents/schedules/${encodeURIComponent(id)}`, input),
  deleteSchedule: (id: string | number) =>
    del<void>(`/api/agents/schedules/${encodeURIComponent(id)}`),
  runScheduleNow: (id: string | number) =>
    post<any>(`/api/agents/schedules/${encodeURIComponent(id)}/run`),

  listConnections: async () => {
    const res = await request<any>('/api/agents/connections');
    let connections = (Array.isArray(res) ? res : res?.connections || []) as ConnectionInfo[];
    
    // Also fetch Scalekit connections
    try {
      const scalekitRes = await request<any>('/api/social-studio/oauth/scalekit/accounts');
      if (scalekitRes && scalekitRes.connections) {
        connections = [...connections, ...scalekitRes.connections];
      }
    } catch (e) {
      console.warn('Failed to load Scalekit connections', e);
    }
    
    return { connections };
  },
  listAvailableConnectors: () =>
    request<any>('/api/agents/connections/available').then((res) => ({
      connectors: (Array.isArray(res) ? res : res?.connectors || []) as ConnectorConfig[],
    })),
  createConnection: (input: unknown) => post<ConnectionInfo>('/api/agents/connections', input),
  deleteConnection: (id: string | number) =>
    del<void>(`/api/agents/connections/${encodeURIComponent(id)}`),

  listMarketingCampaigns: () =>
    request<any>('/api/agents/marketing/campaigns').then((res) => ({
      campaigns: (Array.isArray(res) ? res : res?.campaigns || []) as MarketingCampaign[],
    })),
  generateMarketingCampaign: (input: unknown) =>
    post<MarketingCampaign>('/api/agents/marketing/campaigns/generate', input),
  createMarketingCampaign: (input: unknown) =>
    post<MarketingCampaign>('/api/agents/marketing/campaigns', input),
  approveMarketingCampaign: (id: string | number, input?: unknown) =>
    post<MarketingCampaign>(
      `/api/agents/marketing/campaigns/${encodeURIComponent(id)}/approve`,
      input,
    ),
  scheduleMarketingCampaign: (id: string | number, input?: unknown) =>
    post<MarketingCampaign>(
      `/api/agents/marketing/campaigns/${encodeURIComponent(id)}/schedule`,
      input,
    ),
  listMarketingAuditEvents: () =>
    request<any>('/api/agents/marketing/audit').then((res) => ({
      events: (Array.isArray(res) ? res : res?.events || []) as MarketingAuditEvent[],
    })),

  safetyStats: () => request<SafetyStats>('/api/agents/safety/stats'),
  safetyVerdicts: () =>
    request<any>('/api/agents/safety/verdicts').then((res) => ({
      verdicts: (Array.isArray(res) ? res : res?.verdicts || []) as SafetyVerdict[],
    })),
  safetyEscalations: () =>
    request<any>('/api/agents/safety/escalations').then((res) => ({
      escalations: (Array.isArray(res) ? res : res?.escalations || []) as SafetyEscalation[],
    })),
  resolveEscalation: (id: string | number, input?: unknown) =>
    post<SafetyEscalation>(
      `/api/agents/safety/escalations/${encodeURIComponent(id)}/resolve`,
      input,
    ),

  listSecurityFindings: () =>
    request<any>('/api/agents/security/findings').then((res) => ({
      findings: (Array.isArray(res) ? res : res?.findings || []) as SecurityFinding[],
    })),
  runCommitGuardScan: (payload: { repo_url: string; max_findings?: number }) =>
    post<{ job_id: string }>('/api/agents/security/scan', payload),
  verifySecurityFinding: (id: string | number, input?: unknown) =>
    post<SecurityFinding>(
      `/api/agents/security/findings/${encodeURIComponent(id)}/verify`,
      input,
    ),

  getSettings: () => request<AppSettings>('/api/agents/settings'),
  updateSettings: (input: AppSettings) => put<AppSettings>('/api/agents/settings', input),
};

export const fetchDocuments = () => request<any[]>('/api/agents/context/documents');
export const fetchFacts = (entityId?: string) =>
  request<any[]>(entityId ? `/api/agents/context/facts?entity_id=${encodeURIComponent(entityId)}` : '/api/agents/context/facts');
export const resolveConflict = (id: string, input: unknown) =>
  post<any>(`/api/agents/context/conflicts/${encodeURIComponent(id)}/resolve`, input);
