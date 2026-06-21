import type { AgentSummary, TaskSummary, WorkflowDetail } from './serverLiteTypes';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Agent Mesh API request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const serverLiteApi = {
  listAgents: () =>
    request<any>('/api/agents').then(
      (res) => (Array.isArray(res) ? res : res?.agents ?? []) as AgentSummary[],
    ),
  getWorkflow: (workflowId: string) =>
    request<WorkflowDetail>(`/api/workflow/${encodeURIComponent(workflowId)}`),
  getWorkflowTasks: (workflowId: string) =>
    request<TaskSummary[]>(`/api/workflow/${encodeURIComponent(workflowId)}/tasks`),
  pauseWorkflow: (workflowId: string) =>
    request<void>(`/api/workflow/${encodeURIComponent(workflowId)}/pause`, { method: 'PUT' }),
  resumeWorkflow: (workflowId: string) =>
    request<void>(`/api/workflow/${encodeURIComponent(workflowId)}/resume`, { method: 'PUT' }),
  retryWorkflow: (workflowId: string) =>
    request<void>(`/api/workflow/${encodeURIComponent(workflowId)}/retry`, { method: 'POST' }),
  runAgent: (agentId: string, goal: string, context?: string) =>
    request<{ workflowId: string }>(`/api/agents/${encodeURIComponent(agentId)}/run`, {
      method: 'POST',
      body: JSON.stringify({ goal, context }),
    }),
};
