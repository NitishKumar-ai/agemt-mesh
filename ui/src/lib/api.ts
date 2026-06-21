import type {
  AgentSession,
  AppSettings,
  ApprovalEvent,
  AskAnswer,
  Citation,
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
  Routine,
  RoutineRun,
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

  askQuestion: (query: string, projectId: string) =>
    post<AskAnswer>('/api/workflows/query', { query, projectId }),

  // Streamed variant of askQuestion. Tokens arrive incrementally over SSE; the
  // final `done` event carries the authoritative confidence/level/citations.
  // Pass an AbortSignal to support a Stop button. Falls back to throwing if the
  // server rejects the request before the stream opens.
  askQuestionStream: askQuestionStream,

  // Growth Memory: structured founder growth brief (campaign + funnel + feature
  // + user response + superseded report + recommended actions).
  founderGrowthBrief: (input: { campaign: string; feature?: string; channels?: string[] }) =>
    post<any>('/api/workflows/founder-growth-brief', input),

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

  // Routines: scheduled multi-agent orchestrations that deliver a finished report.
  listRoutines: () =>
    request<any>('/api/routines').then((res) => ({
      routines: (Array.isArray(res) ? res : res?.routines || []) as Routine[],
    })),
  createRoutine: (input: unknown) => post<Routine>('/api/routines', input),
  updateRoutine: (id: string, input: unknown) =>
    put<Routine>(`/api/routines/${encodeURIComponent(id)}`, input),
  deleteRoutine: (id: string) => del<void>(`/api/routines/${encodeURIComponent(id)}`),
  runRoutineNow: (id: string) => post<RoutineRun>(`/api/routines/${encodeURIComponent(id)}/run`),
  listRoutineRuns: (id?: string) =>
    request<any>(id ? `/api/routines/${encodeURIComponent(id)}/runs` : '/api/routines/runs').then(
      (res) => ({ runs: (Array.isArray(res) ? res : res?.runs || []) as RoutineRun[] }),
    ),
  getRoutineRun: (runId: string) =>
    request<RoutineRun>(`/api/routines/runs/${encodeURIComponent(runId)}`),

  listConnections: () =>
    request<any>('/api/agents/connections').then((res) => ({
      connections: (Array.isArray(res) ? res : res?.connections || []) as ConnectionInfo[],
    })),
  listAvailableConnectors: () =>
    request<any>('/api/agents/connections/available').then((res) => ({
      connectors: (Array.isArray(res) ? res : res?.connectors || []) as ConnectorConfig[],
    })),
  createConnection: (input: unknown) => post<ConnectionInfo>('/api/agents/connections', input),
  deleteConnection: (id: string | number) =>
    del<void>(`/api/agents/connections/${encodeURIComponent(id)}`),

  socialStatus: () =>
    request<{
      platforms: Record<string, { connected: boolean; expired?: boolean; connectedAt?: number | null; metadata?: any }>;
    }>('/api/social-studio/status'),
  disconnectSocial: (platform: string) =>
    del<void>(`/api/social-studio/token/${encodeURIComponent(platform)}`),

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

/** Callbacks for a streamed answer. {@link onDone} always fires on success. */
export interface AnswerStreamHandlers {
  /** Citations resolved before generation starts (permission-filtered). */
  onMeta?: (citations: Citation[]) => void;
  /** An incremental chunk of answer text. */
  onToken: (text: string) => void;
  /** The completed answer with authoritative confidence/level/citations. */
  onDone: (answer: AskAnswer) => void;
  /** A server-side error surfaced mid-stream. */
  onError?: (message: string) => void;
}

type StreamFrame =
  | { type: 'meta'; citations: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'done'; answer: string; confidence: number; level: AskAnswer['level']; citations: Citation[] }
  | { type: 'error'; message: string };

/**
 * POST a query and consume the SSE answer stream. Resolves once the stream ends.
 * Aborting via `signal` stops reading and rejects with an AbortError, which the
 * caller can detect with `signal.aborted` to preserve partial text.
 */
async function askQuestionStream(
  query: string,
  projectId: string,
  handlers: AnswerStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/workflows/query/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ query, projectId }),
    signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Agent Mesh streaming request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame: StreamFrame) => {
    switch (frame.type) {
      case 'meta':
        handlers.onMeta?.(frame.citations);
        break;
      case 'token':
        handlers.onToken(frame.text);
        break;
      case 'done':
        handlers.onDone({
          answer: frame.answer,
          confidence: frame.confidence,
          level: frame.level,
          citations: frame.citations,
        });
        break;
      case 'error':
        handlers.onError?.(frame.message);
        break;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        try {
          dispatch(JSON.parse(dataLine.slice(5).trim()) as StreamFrame);
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export const fetchDocuments = () => request<any[]>('/api/agents/context/documents');
export const fetchFacts = (entityId?: string) =>
  request<any[]>(entityId ? `/api/agents/context/facts?entity_id=${encodeURIComponent(entityId)}` : '/api/agents/context/facts');
export const resolveConflict = (id: string, input: unknown) =>
  post<any>(`/api/agents/context/conflicts/${encodeURIComponent(id)}/resolve`, input);
